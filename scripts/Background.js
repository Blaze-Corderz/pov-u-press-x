import * as PIXI from "pixi.js";
import { Game } from "./Game";
import { imageToBase64 } from "./Utils";
import { ObjectsController } from "./HitObjects/ObjectsController";

export class Background {
    container;
    sprite;
    mask;
    filter;

    blob;
    videoHTML;

    texture;
    videoTexture;
    offset = 0;

    w = 1;
    h = 1;

    static init() {
        this.container = new PIXI.Container();
        this.sprite = new PIXI.Sprite();
        this.mask = new PIXI.Graphics();

        this.filter = new PIXI.BlurFilter({
            kernelSize: 9,
            quality: 10,
            strength: 50,
        });
        this.filter.blur = 0;

        this.sprite.filters = [this.filter];

        // this.mask.rect(0, 0, Game.MASTER_CONTAINER.w, Game.MASTER_CONTAINER.h);
        this.mask.rect(0, 0, Game.MASTER_CONTAINER.w, Game.MASTER_CONTAINER.h).fill(0x000000);

        this.container.addChild(this.sprite, this.mask);
        this.container.label = "Hello";
        // this.container.mask = this.mask;

        this._src = null;
        return this.container;
    }

    static reset() {
        this.sprite.texture = undefined;
        this._src = undefined;
        this._videoSrc = undefined;

        this.texture = undefined;
        this.videoTexture = undefined;

        this.offset = 0;
    }

    static get src() {
        return this._src;
    }

    static set src(val) {
        this._src = val;
        this.setBG();
    }

    static get videoSrc() {
        return this._videoSrc;
    }

    static set videoSrc(val) {
        this._videoSrc = val;
        this.setVideoBG();
    }

    static changeStrength(val) {
        this.filter.blur = (val / 20) * 100;
    }

    static changeOpacity(val) {
        const wRatio = Game.MASTER_CONTAINER.w / this.w;
        const hRatio = Game.MASTER_CONTAINER.h / this.h;
        const ratio = Math.max(wRatio, hRatio);

        this.mask
            .clear()
            .rect(0, 0, this.w * ratio, this.h * ratio)
            .fill({
                color: 0x000000,
                alpha: val,
            });
    }

    static manuallyUpdateSize() {
        this.sprite.scale.set(1.0);

        if (this.w !== this.sprite.width) {
            this.w = this.sprite.width;
        }

        if (this.h !== this.sprite.height) {
            this.h = this.sprite.height;
        }

        const wRatio = Game.MASTER_CONTAINER.w / this.w;
        const hRatio = Game.MASTER_CONTAINER.h / this.h;
        const ratio = Math.max(wRatio, hRatio);

        this.sprite.scale.set(ratio);

        this.container.x = (Game.MASTER_CONTAINER.w - this.w * ratio) / 2;
        this.container.y = (Game.MASTER_CONTAINER.h - this.h * ratio) / 2;

        this.mask
            .clear()
            .rect(0, 0, this.w * ratio, this.h * ratio)
            .fill({ color: 0x000000, alpha: Game.ALPHA });
    }

    static updateSize() {
        if (Game.EMIT_STACK.length === 0) return;
        this.manuallyUpdateSize();
    }

    static async setBG() {
        const texture = await PIXI.Assets.load({ src: this.src, loadParser: "loadTextures" });
        this.texture = texture;

        this.sprite.texture = texture;

        this.manuallyUpdateSize();

        const currentLocalStorage = JSON.parse(localStorage.getItem("settings"));
        this.changeStrength(currentLocalStorage.background.blur);
    }

    static playVideo() {
        if (!this.videoHTML || !this.videoSrc) return;

        const startTime = Math.max(ObjectsController.lastTimestamp - Background.offset, 0);
        this.videoHTML.currentTime = startTime / 1000;
        this.videoHTML.playbackRate = Game.PLAYBACK_RATE;

        this.videoHTML.play();
    }

    static pauseVideo() {
        if (!this.videoHTML || !this.videoSrc) return;

        this.videoHTML.pause();

        const endTime = Math.max(ObjectsController.lastTimestamp - Background.offset, 0);
        this.videoHTML.currentTime = endTime / 1000;
    }

    static seekTo(timestamp) {
        this.videoHTML.currentTime = Math.max(timestamp - Background.offset, 0) / 1000;
    }

    static switch(mode) {
        if (!this.videoSrc) return;

        console.log(mode);

        if (mode === "VIDEO") {
            this.sprite.texture = this.videoTexture;
            this.manuallyUpdateSize();
            return;
        }

        this.sprite.texture = this.texture;
        this.manuallyUpdateSize();
    }

    static async setVideoBG() {
        const texture = await PIXI.Assets.load({
            src: this.videoSrc,
            data: {
                autoPlay: false,
            },
            loadParser: "loadVideo",
        });
        this.videoTexture = texture;

        this.videoHTML = texture.source.resource;

        // console.log(this.videoHTML);
        this.videoHTML.autoplay = false;
        this.videoHTML.currentTime = 0;
        this.videoHTML.pause();

        if (!Game.IS_VIDEO) return;
        this.sprite.texture = texture;
        this.manuallyUpdateSize();
    }
}
