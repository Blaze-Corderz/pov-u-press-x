import { Game } from "../Game.js";
import { Texture } from "../Texture.js";
import { Beatmap } from "../Beatmap.js";
// import { ObjectsController } from "./ObjectsController.js";
// import { ProgressBar } from "../Progress.js";
import { SliderEnd } from "./SliderEnd.js";
import { HitCircle } from "./HitCircle.js";
import { SliderGeometryContainers } from "./SliderMesh.js";
import { SliderBall } from "./SliderBall.js";
import { ReverseArrow } from "./ReverseArrow.js";
import { SliderTick } from "./SliderTick.js";
import {
	Fixed,
	Clamp,
	Dist,
	Add,
	FlipHR,
	LinearEstimation,
	binarySearch,
} from "../Utils.js";
import { Skinning } from "../Skinning.js";
import { ScoreParser } from "../ScoreParser.js";
import * as d3 from "d3";
import * as PIXI from "pixi.js";
import { SliderCalculator } from "./SliderCalculator.js";

const _32_BIT_LIMIT = 2147483647;

export class Slider {
	ILLEGAL = false;

	originalArr = [];
	angleList = [];
	realTrackPoints;
	sliderParts;
	sliderEndEvalPosition;
	sliderEndVisualPosition;

	sliderLength;
	svMultiplier;
	baseSV;

	beatStep;

	startTime;
	endTime;

	repeat;

	sliderType;

	stackHeight = 0;

	time;
	hitTime;

	SliderMesh;
	SliderSelectedMesh;

	obj;
	selected;
	selectedSliderEnd;

	hitCircle;
	revArrows = [];
	ticks = [];
	ball;
	sliderEnd;

	angleE;
	angleS;

	colourIdx = 1;
	colourHaxedIdx = 1;
	comboIdx = 1;

	isHover = false;
	isVisible = false;
	opacity = 0;

	hitSounds;

	scaleRate = 1;

	isHR = false;

	judgementContainer;
	judgement;

	skinType;

	binom(n, k) {
		if (k < 0 || k > n) return 0;
		if (k == 0 || k == n) return 1;

		var coeff = 1;
		for (var i = 0; i < k; i++) coeff = (coeff * (n - i)) / (i + 1);

		return coeff;
	}

	bezier(t, plist) {
		var order = plist.length - 1;

		var y = 0;
		var x = 0;

		for (let i = 0; i <= order; i++) {
			x =
				x +
				this.binom(order, i) *
					Math.pow(1 - t, order - i) *
					Math.pow(t, i) *
					plist[i].x;
			y =
				y +
				this.binom(order, i) *
					Math.pow(1 - t, order - i) *
					Math.pow(t, i) *
					plist[i].y;
		}

		return {
			x: x,
			y: y,
		};
	}

	drawSelected() {
		if (this.ILLEGAL) return;

		this.sliderGeometryContainer.selSliderContainer.alpha = 1;
		this.sliderGeometryContainer.selSliderContainer.tint = Object.values(
			d3.rgb(Game.SKINNING.type === "0" ? `#edab00` : `#3197ff`),
		).map((val) => val / 255);
		this.sliderGeometryContainer.selSliderContainer.update();

		this.hitCircle.drawSelected();

		const circleBaseScale = Beatmap.moddedStats.radius / 54.4;
		const endPosition = this.sliderEndVisualPosition;

		const currentStackOffset = Beatmap.moddedStats.stackOffset;

		const x = endPosition.x + this.stackHeight * currentStackOffset;
		const y = !Game.MODS.HR
			? endPosition.y + this.stackHeight * currentStackOffset
			: 384 - endPosition.y + this.stackHeight * currentStackOffset;

		this.selectedSliderEnd.x = x * Game.SCALE_RATE;
		this.selectedSliderEnd.y = y * Game.SCALE_RATE;

		this.selectedSliderEnd.scale.set(
			circleBaseScale *
				Game.SCALE_RATE *
				(236 / 256) ** 2 *
				(Game.SKINNING.type === "0" ? 1 : 0.5),
		);
	}

	playHitsound(timestamp, lastTimestamp) {
		if (!timestamp || !lastTimestamp) return;

		if (this.hitSounds.defaultSet.hitSoundIdx !== 0)
			this.hitSounds.sliderWhistle.playLoop(
				timestamp >= this.hitTime,
				timestamp <= this.endTime,
				this.endTime - timestamp,
			);
		this.hitSounds.sliderSlide.playLoop(
			timestamp >= this.hitTime,
			timestamp <= this.endTime,
			this.endTime - timestamp,
		);

		if (!Game.BEATMAP_FILE.audioNode.isPlaying) return;

		if (timestamp >= this.hitTime && lastTimestamp < this.hitTime) {
			if (!ScoreParser.REPLAY_DATA) {
				this.hitSounds.sliderHead.play();
				return;
			}

			// Will reimplement later
			const evaluation = binarySearch(
				ScoreParser.EVAL_LIST,
				this.time,
				(evaluation, time) => {
					if (evaluation.time < time) return -1;
					if (evaluation.time > time) return 1;
					return 0;
				},
			);

			if (
				ScoreParser.EVAL_LIST[evaluation]?.checkPointState.findLast(
					(checkPoint) => checkPoint.type === "Slider Head",
				).eval === 1
			)
				this.hitSounds.sliderHead.play();
			return;
		}

		if (timestamp >= this.endTime && lastTimestamp < this.endTime) {
			if (!ScoreParser.REPLAY_DATA) {
				this.hitSounds.sliderTail.play();
				return;
			}

			// Will reimplement later
			const evaluation = binarySearch(
				ScoreParser.EVAL_LIST,
				this.time,
				(evaluation, time) => {
					if (evaluation.time < time) return -1;
					if (evaluation.time > time) return 1;
					return 0;
				},
			);

			if (
				ScoreParser.EVAL_LIST[evaluation]?.checkPointState.findLast(
					(checkPoint) => checkPoint.type === "Slider End",
				).eval === 1
			) {
				this.hitSounds.sliderTail.play();
				return;
			}
		}
	}

	handleSkinChange() {
		if (this.skinType === Game.SKINNING.type) return;
		this.skinType = Game.SKINNING.type;

		this.selectedSliderEnd.texture =
			Game.SKINNING.type === "0"
				? Texture.SELECTED_ARGON.texture
				: Texture.SELECTED.texture;
		this.hitCircle.handleSkinChange();
	}

	drawBorder(timestamp) {
		this.handleSkinChange();
		// console.log(this.time, opacity, percentage);

		// Calculate object radius on HR / EZ toggle
		const currentStackOffset = Beatmap.moddedStats.stackOffset;

		// Calculate current timing stats
		const currentPreempt = Beatmap.moddedStats.preempt;
		const currentFadeIn = Beatmap.moddedStats.fadeIn;
		const fadeOutTime = 240;

		// Calculate object opacity
		let currentOpacity = 0;
		if (!Game.MODS.HD) {
			currentOpacity = 1;

			if (timestamp < this.time) {
				currentOpacity =
					(timestamp - (this.time - currentPreempt)) / currentFadeIn;
			}
			if (timestamp > this.endTime) {
				currentOpacity = 1 - (timestamp - this.endTime) / fadeOutTime;
				if (Game.SLIDER_APPEARANCE.snaking && this.hitTime <= this.killTime)
					currentOpacity = 0;
			}
		} else {
			currentOpacity = 1 - (timestamp - this.time) / (this.endTime - this.time);
			if (timestamp < this.time)
				currentOpacity =
					(timestamp - (this.time - currentPreempt)) / currentFadeIn;
		}
		currentOpacity = Clamp(currentOpacity, 0, 1);
		this.opacity = currentOpacity;
		this.SliderMesh.alpha = currentOpacity;

		// Calculate object progress percentage
		const currentPercentage = Clamp(
			(timestamp - this.time) / (this.endTime - this.time),
			0,
			1,
		);

		// Set object snaking section
		if (Game.SLIDER_APPEARANCE.snaking) {
			if (timestamp < this.hitTime) {
				this.SliderMesh.startt = 0;
				this.SliderMesh.endt = Clamp(currentOpacity * 2, 0, 1);
				if (this.hitTime > this.endTime) this.SliderMesh.endt = 1;
			} else if (timestamp >= this.hitTime) {
				if (this.repeat % 2 === 0) {
					this.SliderMesh.startt = 0;
					this.SliderMesh.endt =
						1 - Clamp((currentPercentage - 1) * this.repeat + 1, 0, 1);
				} else {
					this.SliderMesh.startt = Clamp(
						(currentPercentage - 1) * this.repeat + 1,
						0,
						1,
					);
					this.SliderMesh.endt = 1;
				}
			}
		} else {
			this.SliderMesh.startt = 0;
			this.SliderMesh.endt = 1;
		}

		// this.sliderBall.tint = colour;

		// Set slider color
		const colors = Game.SLIDER_APPEARANCE.ignoreSkin
			? Skinning.DEFAULT_COLORS
			: Beatmap.COLORS;
		const idx = Game.SLIDER_APPEARANCE.ignoreSkin
			? this.colourIdx
			: this.colourHaxedIdx;
		// this.SliderMesh.tintid = 0;
		this.SliderMesh.tint = Object.values(
			d3.rgb(`#${colors[idx % colors.length].toString(16).padStart(6, "0")}`),
		).map((val) => val / 255);
		this.SliderMesh.update();
		// console.log(this.SliderMesh.tint);

		// this.SliderMesh.update();

		if (this.scaleRate !== Game.SCALE_RATE || this.isHR !== Game.MODS.HR) {
			this.scaleRate = Game.SCALE_RATE;
			this.isHR = Game.MODS.HR;

			this.nodesLine.clear().setStrokeStyle({ width: 2, color: 0xffffff });
			this.nodesGraphics.forEach((node, idx) => {
				let { x, y } = this.nodes[idx].position;
				if (Game.MODS.HR) y = 384 - y;

				x =
					(parseInt(x) + this.stackHeight * currentStackOffset) *
					Game.SCALE_RATE;
				y =
					(parseInt(y) + this.stackHeight * currentStackOffset) *
					Game.SCALE_RATE;

				node.x = x;
				node.y = y;

				if (idx === 0) {
					this.nodesLine.moveTo(x, y);
					return;
				}

				this.nodesLine.lineTo(x, y).stroke();
			});
		}

		if ((this.isHover && this.isVisible) !== this.nodesContainer.visible) {
			this.nodesContainer.visible = this.isHover && this.isVisible;
		}
	}

	updateJudgement(timestamp) {
		if (!this.judgement) return;
		this.judgement.draw(timestamp);
		const endPosition = this.realTrackPoints.at(-1);

		const currentStackOffset = Beatmap.moddedStats.stackOffset;

		const x =
			((endPosition.x + this.stackHeight * currentStackOffset) * Game.WIDTH) /
			512;
		const y = !Game.MODS.HR
			? ((endPosition.y + this.stackHeight * currentStackOffset) * Game.WIDTH) /
				512
			: ((384 - endPosition.y + this.stackHeight * currentStackOffset) *
					Game.WIDTH) /
				512;

		this.judgement.obj.x = x;
		this.judgement.obj.y = y;
	}

	draw(timestamp) {
		if (this.ILLEGAL) return;

		this.isVisible = timestamp >= this.startTime && timestamp < this.killTime;

		this.drawBorder(timestamp);
		this.hitCircle.draw(timestamp);
		this.sliderEnd.draw(timestamp);
		this.revArrows.forEach((arrow) => arrow.draw(timestamp));
		this.ticks.forEach((tick) => tick.draw(timestamp));
		this.ball.draw(timestamp);
		this.updateJudgement(timestamp);
		// if (!ProgressBar.IS_DRAGGING) this.playHitsound(timestamp);
	}

	Dist(p1, p2) {
		return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
	}

	getPointAtTime(time) {
		if (time <= this.time) return this.realTrackPoints.at(0);
		if (time >= this.endTime) return this.realTrackPoints.at(-1);

		let _t =
			((time - this.time) / (this.endTime - this.time)) *
			(this.realTrackPoints.length - 1);
		if (isNaN(_t)) _t = 0;

		const startIdx = Math.floor(_t);
		const endIdx = Math.ceil(_t);
		const rawIdx = _t;

		const lerpValue = (rawIdx - startIdx) / (endIdx - startIdx);

		const x =
			this.realTrackPoints[startIdx].x +
			lerpValue *
				(this.realTrackPoints[endIdx].x - this.realTrackPoints[startIdx].x);
		const y =
			this.realTrackPoints[startIdx].y +
			lerpValue *
				(this.realTrackPoints[endIdx].y - this.realTrackPoints[startIdx].y);
		// const angle = this.realTrackPoints[startIdx].angle + lerpValue * (this.realTrackPoints[endIdx].angle - this.realTrackPoints[startIdx].angle);
		const angle =
			lerpValue >= 0.5
				? this.realTrackPoints[endIdx].angle
				: this.realTrackPoints[startIdx].angle;
		const t = (time - this.time) / (this.endTime - this.time);

		return {
			x,
			y,
			t,
			angle,
		};
	}

	getSliderPart() {
		const baseTicksList = [];
		const endTime = this.endTime;

		for (let i = 0; i < this.sliderTicksCount / this.repeat; i++) {
			baseTicksList.push(
				this.angleList[
					Math.round(
						(((i + 1) * this.beatStep) /
							this.sliderTime /
							Beatmap.stats.sliderTickRate) *
							(this.angleList.length - 1),
					)
				],
			);
		}

		const sliderParts = [];
		const sliderEndEvalPosition = {
			...this.realTrackPoints[
				Math.round(
					Clamp(
						(this.killTime - this.time - 36) / (endTime - this.time),
						0,
						1,
					) *
						(this.realTrackPoints.length - 1),
				)
			],
			type: "Slider End",
			time: endTime - 36 < this.time ? endTime - 15 : endTime - 36,
		};

		// if (this.time === 9596) console.log(this.sliderTicksCount);

		for (let i = 0; i < this.repeat; i++) {
			// Time from the last slider tick to the slider end
			const tickEndDelta =
				this.sliderTime - (this.sliderTicksCount / this.repeat) * this.beatStep;
			const currentTrackPoint =
				i % 2 === 0 ? this.angleList.at(-1) : this.angleList[0];

			if (i % 2 === 0) {
				sliderParts.push(
					...baseTicksList.map((tick, idx) => {
						return {
							...tick,
							type: "Slider Tick",
							time:
								i * this.sliderTime +
								Math.floor(
									this.time +
										((idx + 1) * this.beatStep) / Beatmap.stats.sliderTickRate,
								),
						};
					}),
				);
			} else {
				sliderParts.push(
					...baseTicksList.toReversed().map((tick, idx) => {
						return {
							...tick,
							type: "Slider Tick",
							time:
								(i - 1) * this.sliderTime +
								Math.floor(
									this.time +
										this.sliderTime +
										(idx * this.beatStep) / Beatmap.stats.sliderTickRate +
										tickEndDelta,
								),
						};
					}),
				);
			}

			if (i < this.repeat - 1)
				sliderParts.push({
					...currentTrackPoint,
					type: "Slider Repeat",
					time: this.time + Math.round((i + 1) * this.sliderTime),
				});
		}

		this.sliderParts = sliderParts;
		this.sliderEndEvalPosition = sliderEndEvalPosition;
	}

	eval(inputIdx) {
		const endTime = this.endTime;

		const radius = 54.4 - 4.48 * Beatmap.stats.circleSize;
		let currentInput = ScoreParser.CURSOR_DATA[inputIdx];

		let internalInputIdx = inputIdx;
		let val = this.hitCircle.eval(inputIdx);

		while (!val) {
			val = this.hitCircle.eval(++inputIdx);
			if (!ScoreParser.CURSOR_DATA[inputIdx]) return null;
		}
		if (val === null) return null;

		let state = val.val === 0 ? "UNTRACKING" : "TRACKING";
		let sliderPartIdx = 0;

		const sliderParts = this.sliderParts
			.concat([this.sliderEndEvalPosition])
			.sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0));
		const sliderPartsEval = [
			{ type: "Slider Head", eval: val.val === 0 ? 0 : 1 },
		];

		// if (this.time === 9596) console.log(sliderParts);

		const currentStackOffset = Beatmap.moddedStats.stackOffset;
		const additionalMemory = {
			x: this.stackHeight * currentStackOffset,
			y: this.stackHeight * currentStackOffset,
		};

		let firstTrackingTime = val.inputTime;

		while (currentInput.time <= endTime) {
			const pointAtT = this.getPointAtTime(currentInput.time);

			if (!pointAtT) {
				currentInput = ScoreParser.CURSOR_DATA[++internalInputIdx];
				if (!currentInput) break;
				continue;
			}

			const accountedPointAtT = Game.MODS.HR
				? Add(FlipHR(pointAtT), additionalMemory)
				: Add(pointAtT, additionalMemory);
			// Untrack slider if release keys / move out of slider follow circle
			if (state === "TRACKING")
				if (
					currentInput.inputArray.length === 0 ||
					Fixed(Dist(currentInput, accountedPointAtT) / (2.4 * radius), 5) > 1
				) {
					state = "UNTRACKING";
					// if (this.time === 87669) {
					//     if (currentInput.inputArray.length === 0) console.log("Untracked due to release key");
					//     if (Fixed(Dist(currentInput, accountedPointAtT) / (2.4 * radius), 5) > 1) console.log("Untracked due to unfollow");
					// }
				}

			// Track slider if press keys AND move inside of sliderB
			if (state === "UNTRACKING") {
				if (
					currentInput.inputArray.length !== 0 &&
					Fixed(Dist(currentInput, accountedPointAtT) / radius, 5) < 1
				) {
					state = "TRACKING";
					if (!firstTrackingTime) firstTrackingTime = currentInput.time;
				}
			}

			if (
				sliderParts[sliderPartIdx] &&
				ScoreParser.CURSOR_DATA[internalInputIdx + 1]?.time >
					sliderParts[sliderPartIdx]?.time
			) {
				if (currentInput.time !== sliderParts[sliderPartIdx]?.time) {
					const nextInput = ScoreParser.CURSOR_DATA[internalInputIdx + 1];
					const estimatedInput = LinearEstimation(
						currentInput,
						nextInput,
						(sliderParts[sliderPartIdx].time - currentInput.time) /
							(nextInput.time - currentInput.time),
					);

					// Untrack slider if release keys / move out of slider follow circle
					if (state === "TRACKING")
						if (
							currentInput.inputArray.length === 0 ||
							Fixed(
								Dist(
									estimatedInput,
									!Game.MODS.HR
										? sliderParts[sliderPartIdx]
										: FlipHR(sliderParts[sliderPartIdx]),
								) /
									(2.4 * radius),
								5,
							) > 1
						) {
							state = "UNTRACKING";
							// if (this.time === 87669) {
							//     if (currentInput.inputArray.length === 0) console.log("Untracked due to release key");
							//     if (Fixed(Dist(estimatedInput, FlipHR(sliderParts[sliderPartIdx])) / (2.4 * radius), 5) > 1)
							//         console.log("Untracked due to unfollow", currentInput, estimatedInput, FlipHR(sliderParts[sliderPartIdx]));
							// }
						}

					// Track slider if press keys AND move inside of sliderB
					if (state === "UNTRACKING") {
						if (
							currentInput.inputArray.length !== 0 &&
							Fixed(
								Dist(currentInput, sliderParts[sliderPartIdx]) / radius,
								5,
							) < 1
						) {
							state = "TRACKING";
							if (!firstTrackingTime) firstTrackingTime = currentInput.time;
						}
					}
				}

				sliderPartsEval.push({
					type: sliderParts[sliderPartIdx].type,
					eval:
						state === "TRACKING" &&
						currentInput.time <= sliderParts[sliderPartIdx].time
							? 1
							: 0,
				});

				sliderPartIdx++;
			}

			if (
				!sliderParts[sliderPartIdx] ||
				sliderParts[sliderPartIdx].time >=
					ScoreParser.CURSOR_DATA[internalInputIdx + 1]?.time
			)
				internalInputIdx++;

			currentInput = ScoreParser.CURSOR_DATA[internalInputIdx];
			if (!currentInput) break;
			// if (this.time === 252735) console.log(currentInput.time, state);
		}

		const evaluated = sliderPartsEval.every(
			(checkPoint) => checkPoint.eval === 1,
		)
			? 300
			: sliderPartsEval.every((checkPoint) => checkPoint.eval === 0)
				? 0
				: sliderPartsEval.filter((checkPoint) => checkPoint.eval === 1).length *
							2 >=
						1 + this.sliderTicksCount * this.repeat + this.repeat
					? 100
					: 50;

		// if (evaluated !== 300) console.log(this.time, sliderPartsEval, sliderParts, endTime);

		// this.hitTime = firstTrackingTime;
		// this.hitTime = this.endTime;

		return {
			val: evaluated,
			valV2: val.val,
			checkPointState: sliderPartsEval,
			delta: val.delta,
			inputTime: firstTrackingTime,
		};
	}

	constructor(
		pointLists,
		sliderType,
		sliderLength,
		svMultiplier,
		baseSV,
		beatStep,
		time,
		repeat,
		hitSounds,
		raw,
	) {
		this.sliderType = sliderType;
		const originalArr = pointLists.split("|").map((point) => {
			return {
				x: point.split(":")[0],
				y: point.split(":")[1],
			};
		});

		this.startPosition = {
			x: parseFloat(originalArr[0].x),
			y: parseFloat(originalArr[0].y),
		};

		const nodes = [];
		for (let i = 0; i < originalArr.length; i++) {
			if (
				originalArr[i + 1] &&
				this.Dist(originalArr[i], originalArr[i + 1]) === 0
			) {
				nodes.push({
					type: "Red Anchor",
					position: originalArr[i],
				});

				i++;
				continue;
			}

			nodes.push({
				type: "White Anchor",
				position: originalArr[i],
			});
		}
		this.nodes = nodes;

		this.originalArr = originalArr;
		this.sliderLength = sliderLength;
		this.svMultiplier = Clamp(svMultiplier, 0.1, 20);
		this.repeat = repeat;

		this.baseSV = baseSV;
		this.beatStep = parseFloat(beatStep);
		this.velocity =
			(2 * baseSV) /
			(this.beatStep *
				(this.svMultiplier < 0
					? 1
					: Clamp(-(-100 / this.svMultiplier), 10, 1000)));

		this.time = time;
		this.endTime =
			time +
			((this.sliderLength * this.repeat) / (this.svMultiplier * this.baseSV)) *
				beatStep;
		this.hitTime = this.time;

		this.startTime = time - Beatmap.stats.preempt;
		this.killTime = this.endTime + 240;

		this.sliderTime =
			beatStep *
			Fixed(this.sliderLength / (this.svMultiplier * this.baseSV), 2);
		this.sliderTicksCount =
			(Math.ceil(
				Fixed(
					this.sliderLength /
						this.svMultiplier /
						(baseSV / Beatmap.stats.sliderTickRate),
					1,
				),
			) -
				1) *
			this.repeat;

		this.hitCircle = new HitCircle(originalArr[0].x, originalArr[0].y, time);
		this.hitCircle.hitTime = this.hitTime;
		// this.hitCircle.obj.visible = true;

		this.hitSounds = hitSounds;

		const SliderContainer = new PIXI.Container();
		this.obj = SliderContainer;

		if (sliderLength < 0) {
			this.ILLEGAL = true;
			Beatmap.hasILLEGAL = true;

			return;
		}

		// let start = performance.now();
		const points = new SliderCalculator(
			originalArr.map((point) => {
				return {
					x: parseFloat(point.x),
					y: parseFloat(point.y),
				};
			}),
			sliderType,
			sliderLength,
			time,
		);
		this.angleList = points.points;

		this.sliderEndVisualPosition = structuredClone(this.angleList.at(-1));

		// console.log(this.time, this.svMultiplier, this.baseSV, this.beatStep, this.angleList);
		if (this.angleList.length === 0 || this.sliderTicksCount > 1_000_000) {
			this.ILLEGAL = true;
			Beatmap.hasILLEGAL = true;

			if (this.angleList.length === 0) {
				this.angleList.push(this.originalArr[0]);
			}
			return;
		}
		// console.log(this.time, this.angleList);
		// let took = performance.now() - start;
		// if (took > 20) console.log(`Took: ${took} to create ${this.time} AngleList`);

		this.realTrackPoints = [...Array(this.repeat).keys()]
			.reduce((prev, curr, idx) => {
				let ret = [];
				if (idx % 2 === 0) ret = prev.concat(this.angleList.slice(0, -1));
				if (idx % 2 !== 0)
					ret = prev.concat(
						[...this.angleList]
							.reverse()
							.slice(0, -1)
							.map((p) => {
								return {
									...p,
									angle: p.angle + 180,
								};
							}),
					);

				if (idx === this.repeat - 1) {
					if (idx % 2 === 0) ret.push(this.angleList.at(-1));
					else
						ret.push({
							...this.angleList[0],
							angle: this.angleList[0].angle + 180,
						});
				}

				return ret;
			}, [])
			.map((coord, idx) => {
				const ret = {
					...coord,
					t: idx / ((this.angleList.length - 1) * this.repeat + 1),
				};
				return ret;
			});
		this.getSliderPart();
		// this.draw(0.5);
		// console.log(this.repeat % 2);

		this.endPosition = this.realTrackPoints.at(-1);
		this.sliderEnd = new SliderEnd(this);

		// console.log(time, this.angleList)

		if (this.repeat > 1 && this.angleList.length < 2) {
			Beatmap.hasILLEGAL = true;
			this.ILLEGAL = true;
		}

		if (this.repeat > 1) {
			const deltaXE =
				this.angleList.length === 1
					? 1
					: this.angleList.at(-1).x - this.angleList.at(-2).x;
			const deltaYE =
				this.angleList.length === 1
					? 1
					: this.angleList.at(-1).y - this.angleList.at(-2).y;
			const tanE = Math.abs(deltaYE / deltaXE);

			const deltaXS =
				this.angleList.length === 1
					? 1
					: this.angleList[0].x - this.angleList[1].x;
			const deltaYS =
				this.angleList.length === 1
					? 1
					: this.angleList[0].y - this.angleList[1].y;
			const tanS = Math.abs(deltaYS / deltaXS);

			let angleE =
				deltaXE >= 0
					? (Math.atan(tanE) * 180) / Math.PI
					: 180 - (Math.atan(tanE) * 180) / Math.PI;
			angleE = (((deltaYE >= 0 ? angleE : -angleE) + 180) * Math.PI) / 180;

			let angleS =
				deltaXS >= 0
					? (Math.atan(tanS) * 180) / Math.PI
					: 180 - (Math.atan(tanS) * 180) / Math.PI;
			angleS = (((deltaYS >= 0 ? angleS : -angleS) + 180) * Math.PI) / 180;

			this.angleE = angleE;
			this.angleS = angleS;

			this.sliderParts
				.filter((parts) => parts.type === "Slider Repeat")
				.forEach((info, idx) => {
					const angle = idx % 2 === 0 ? this.angleE : this.angleS;
					const revSprite = new ReverseArrow(
						this,
						info.time,
						info,
						angle,
						this.stackHeight,
						idx,
					);

					this.revArrows.push(revSprite);
				});
		}

		this.sliderParts
			.filter((parts) => parts.type === "Slider Tick")
			.forEach((info, spanIdx) => {
				const tick = new SliderTick(info, this, spanIdx);
				this.ticks.push(tick);
			});

		// console.log(this.time, this.angleList);

		// start = performance.now();
		// this.sliderGeometryContainer = {};
		this.sliderGeometryContainer = new SliderGeometryContainers(
			this.angleList,
			this,
		);
		// this.reInitialize();
		// took = performance.now() - start;
		// if (took > 5) console.log(`Took: ${took}ms to create ${this.time} SliderMesh`);
		this.SliderMesh = this.sliderGeometryContainer.sliderContainer;
		this.selected = this.sliderGeometryContainer.selSliderContainer.container;

		this.SliderMeshContainer = new PIXI.Container();
		this.SliderMeshContainer.addChild(this.SliderMesh.container);

		this.ball = new SliderBall(this);

		this.judgementContainer = new PIXI.Container();

		SliderContainer.addChild(this.SliderMeshContainer);
		SliderContainer.addChild(this.judgementContainer);

		this.ticks.forEach((tick) => SliderContainer.addChild(tick.obj));
		SliderContainer.addChild(this.sliderEnd.hitCircle.obj);
		this.revArrows.forEach((arrow) => SliderContainer.addChild(arrow.obj));

		this.nodesContainer = new PIXI.Container();

		this.nodesLine = new PIXI.Graphics()
			.setStrokeStyle({
				width: 2,
				color: 0xffffff,
			})
			.moveTo(this.nodes[0].position.x, this.nodes[0].position.y);
		this.nodesContainer.addChild(this.nodesLine);

		this.nodesGraphics = this.nodes.map((node) => {
			const fillColor = node.type === "White Anchor" ? 0xffffff : 0xff0000;
			const x = node.position.x;
			const y = node.position.y;

			this.nodesLine.lineTo(x, y);

			const graphic = new PIXI.Graphics().circle(0, 0, 5).fill(fillColor);
			this.nodesContainer.addChild(graphic);

			return graphic;
		});

		this.nodesLine.stroke();

		this.selectedSliderEnd = new PIXI.Sprite(
			Game.SKINNING.type === "0"
				? Texture.SELECTED_ARGON.texture
				: Texture.SELECTED.texture,
		);
		this.selectedSliderEnd.anchor.set(0.5);

		SliderContainer.addChild(this.hitCircle.obj);
		SliderContainer.addChild(this.ball.obj);
		SliderContainer.addChild(this.nodesContainer);

		SliderContainer.label = `${Math.round(this.time)}-SLIDER`;

		// this.obj.alpha = 0.0;

		// this.obj.visible = false;
	}

	get approachCircleObj() {
		return this.hitCircle.approachCircleObj;
	}
}
