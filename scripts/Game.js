PIXI.settings.PREFER_ENV = PIXI.ENV.WEBGL2;

class Game {
    static APP;
    static CONTAINER;
    static GRID;
    static DRAG_WINDOW;
    static FPS;
    static CURSOR;

    static WIDTH;
    static HEIGHT;
    static SLIDER_ACCURACY = 1 / 500;
    static OFFSET_X;
    static OFFSET_Y;

    static SCALE_RATE = 1;

    static IS_CLICKED = false;

    static IS_RESIZING = false;

    // Add certain objects from container
    static addToContainer(objectsList) {
        objectsList.forEach((o) => {
            if (o) Game.CONTAINER.addChild(o.obj);
        });
    }

    // Remove certain objects from container
    static removeFromContainer(objectsList) {
        objectsList.forEach((o) => {
            if (o) Game.CONTAINER.removeChild(o.obj);
        });
    }

    static CursorInit() {
        return new Cursor();
    }

    static FPSInit() {
        PIXI.BitmapFont.from(
            "Torus",
            {
                fontFamily: "Torus",
                fontSize: 15,
                fontWeight: 500,
                fill: 0xffffff,
                align: "right",
            },
            {
                chars: [["a", "z"], ["A", "Z"], ["0", "9"], ". "],
            }
        );

        const fpsSprite = new PIXI.BitmapText(`0fps\nInfinite ms`, {
            fontName: "Torus",
            align: "right",
        });

        fpsSprite.anchor.set(1, 1);
        fpsSprite.x = Game.APP.view.width - 10;
        fpsSprite.y = Game.APP.view.height - 10;

        return fpsSprite;
    }

    static dragWindowInit() {
        // Drag window initialize
        const dragWindow = new PIXI.Graphics().lineStyle({
            width: 2,
            color: 0xffffff,
            alpha: 1,
            alignment: 0,
        });

        // Set drag window initial position
        dragWindow.x = Game.OFFSET_X;
        dragWindow.y = Game.OFFSET_Y;
        dragWindow.alpha = 0;

        return dragWindow;
    }

    static gridInit() {
        // Grid initialize
        const graphics = new PIXI.Graphics()
            .lineStyle({
                width: 1,
                color: 0xffffff,
                alpha: 0.1,
                alignment: 0.5,
            })
            .drawRect(0, 0, 512, 384);

        // Draw grid
        const gridWidth = 512 / 16;
        const gridHeight = 384 / 12;
        for (let i = 0; i < 16; i++) {
            for (let j = 0; j < 12; j++) {
                graphics.drawRect(i * gridWidth, j * gridHeight, gridWidth, gridHeight);
            }
        }

        // Create grid texture and sprite
        const texture = Game.APP.renderer.generateTexture(graphics);

        const grid = new PIXI.Sprite(texture);
        grid.width = 512;
        grid.height = 384;
        grid.x = Game.OFFSET_X;
        grid.y = Game.OFFSET_Y;
        grid.alpha = 1;
        grid.scale.set(Game.SCALE_RATE);

        grid.interactive = true;

        const clickControl = (e) => {
            if (!beatmapFile || !beatmapFile.isLoaded) return;

            const currentTime = beatmapFile.audioNode.getCurrentTime();

            let { x, y } = Game.CONTAINER.toLocal(e.global);
            x /= Game.SCALE_RATE;
            y /= Game.SCALE_RATE;

            const selectedObjList = beatmapFile.beatmapRenderData.objectsController.filtered.filter((o) => checkCollide(x, y, o));

            const selectedObj = selectedObjList.length
                ? selectedObjList.reduce((prev, curr) => {
                      const prevOffset = Math.abs(prev.time - currentTime);
                      const currOffset = Math.abs(curr.time - currentTime);

                      return prevOffset > currOffset ? curr : prev;
                  })
                : undefined;

            if (selectedObj) {
                if (!e.ctrlKey) {
                    selectedHitObject = [selectedObj.obj.time];
                } else {
                    selectedHitObject = selectedHitObject.concat([selectedObj.obj.time]).filter((t, idx, a) => a.indexOf(t) === idx);
                }
            } else if (!didMove) {
                selectedHitObject = [];
            }

            didMove = false;
        };

        grid.on("click", (e) => {
            clickControl(e);
        });
        grid.on("touchstart", (e) => {
            clickControl(e);
        });

        grid.on("touchend", (e) => {});

        grid.on("mousedown", (e) => {
            if (!beatmapFile || !beatmapFile.isLoaded) return;

            let { x, y } = Game.CONTAINER.toLocal(e.global);
            x /= Game.WIDTH / 512;
            y /= Game.WIDTH / 512;

            isDragging = true;
            draggingStartTime = beatmapFile.audioNode.getCurrentTime();
            startX = x;
            startY = y;

            Game.DRAG_WINDOW.clear();
            Game.DRAG_WINDOW.lineStyle({
                width: 1,
                color: 0xffffff,
                alpha: 1,
                alignment: 0,
            });

            Game.DRAG_WINDOW.beginFill(0xffffff, 0.2).drawRect(x, y, 0, 0).endFill();

            Game.DRAG_WINDOW.alpha = 1;

            // console.log("Mouse DOWN");
        });

        grid.on("mouseup", (e) => {
            if (!beatmapFile || !beatmapFile.isLoaded) return;

            if (currentX !== -1 && currentY !== -1) {
                // console.log(selectedHitObject);
                // console.log(startX, startY, currentX, currentY);
            }
            // currentX = -1;
            // currentY = -1;
            isDragging = false;
            Game.DRAG_WINDOW.alpha = 0;
            // console.log("Mouse UP");
        });

        grid.on("mousemove", (e) => {
            if (!beatmapFile || !beatmapFile.isLoaded) return;

            let { x, y } = Game.CONTAINER.toLocal(e.global);
            x /= Game.WIDTH / 512;
            y /= Game.WIDTH / 512;

            if (isDragging) {
                didMove = true;
                draggingEndTime = beatmapFile.audioNode.getCurrentTime();
                currentX = x;
                currentY = y;
                // console.log("Moving");
                handleCanvasDrag(e);

                Game.DRAG_WINDOW.clear();
                Game.DRAG_WINDOW.lineStyle({
                    width: 1,
                    color: 0xffffff,
                    alpha: 1,
                    alignment: 0,
                });

                Game.DRAG_WINDOW.beginFill(0xffffff, 0.2).drawRect(
                    (Math.min(startX, x) * Game.WIDTH) / 512,
                    (Math.min(startY, y) * Game.WIDTH) / 512,
                    (Math.abs(x - startX) * Game.WIDTH) / 512,
                    (Math.abs(y - startY) * Game.WIDTH) / 512
                ).endFill();
                // console.log(startX, startY, currentX, currentY);
            }

            const currentTime = beatmapFile.audioNode.getCurrentTime();
            const inRender = beatmapFile.beatmapRenderData.objectsController.filtered.filter((o) => o.obj instanceof Slider && checkCollide(x, y, o));
            const selectedSlider = inRender.reduce((selected, current) => {
                if (Math.abs(current.obj.time - currentTime) < Math.abs(selected.obj.time - currentTime)) return current;

                return selected;
            }, inRender[0] ?? null);

            beatmapFile.beatmapRenderData.objectsController.slidersList.forEach((o) => (o.obj.isHover = false));

            if (selectedSlider) selectedSlider.obj.isHover = true;

            // if (!beatmapFile.audioNode.isPlaying) beatmapFile.beatmapRenderData.objectsController.draw(currentTime, true);
        });

        return grid;
    }

    static containerInit() {
        // Container initialize
        const container = new PIXI.Container();

        // Set container offset
        container.x = Game.OFFSET_X;
        container.y = Game.OFFSET_Y;

        return container;
    }

    static appResize() {
        // Resize Game Field
        Game.appSizeSetup();

        // Reposition grid
        Game.GRID.x = Game.OFFSET_X;
        Game.GRID.y = Game.OFFSET_Y;
        Game.GRID.scale.set(Game.SCALE_RATE);

        // Reposition container
        Game.CONTAINER.x = Game.OFFSET_X;
        Game.CONTAINER.y = Game.OFFSET_Y;

        // Reposition drag window
        Game.DRAG_WINDOW.x = Game.OFFSET_X;
        Game.DRAG_WINDOW.y = Game.OFFSET_Y;

        // Reposition FPS
        Game.FPS.x = Game.APP.view.width - 10;
        Game.FPS.y = Game.APP.view.height - 10;
    }

    static appSizeSetup() {
        // Set renderer size to container size
        Game.WIDTH = parseInt(getComputedStyle(document.querySelector("#playerContainer")).width) * window.devicePixelRatio;
        Game.HEIGHT = parseInt(getComputedStyle(document.querySelector("#playerContainer")).height) * window.devicePixelRatio;
        Game.APP.renderer.resize(Game.WIDTH, Game.HEIGHT);

        // Change game width and height to match 4:3 aspect ratio
        if (Game.WIDTH / 512 > Game.HEIGHT / 384) {
            Game.WIDTH = (Game.HEIGHT / 384) * 512;
        } else {
            Game.HEIGHT = (Game.WIDTH / 512) * 384;
        }

        // Re-scale game size by 80% to make space for padding
        Game.WIDTH *= 0.9;
        Game.HEIGHT *= 0.9;

        // Calculate offset
        Game.OFFSET_X = (Game.APP.view.width - Game.WIDTH) / 2;
        Game.OFFSET_Y = (Game.APP.view.height - Game.HEIGHT) / 2;

        // Re-scale Game Canvas on Retina / Mobile devices

        // ...
        Game.SCALE_RATE = Game.WIDTH / 512;
    }

    static appInit() {
        // App initialize
        Game.APP = new PIXI.Application({
            width: parseInt(getComputedStyle(document.querySelector("#playerContainer")).width),
            height: parseInt(getComputedStyle(document.querySelector("#playerContainer")).height),
            antialias: true,
            autoDensity: true,
            backgroundAlpha: 0,
        });

        Game.appSizeSetup();
        Game.APP.view.style.transform = `scale(${1 / window.devicePixelRatio})`;
    }

    constructor() {
        Game.appInit();
        Game.CONTAINER = Game.containerInit();
        Game.GRID = Game.gridInit();
        Game.DRAG_WINDOW = Game.dragWindowInit();
        Game.FPS = Game.FPSInit();
        Game.CURSOR = Game.CursorInit();

        Game.APP.stage.addChild(Game.GRID);
        Game.APP.stage.addChild(Game.DRAG_WINDOW);
        Game.APP.stage.addChild(Game.CONTAINER);
        Game.APP.stage.addChild(Game.FPS);
        Game.APP.stage.addChild(Game.CURSOR.obj);

        // Add Game Canvas to DOM
        document.querySelector("#playerContainer").appendChild(Game.APP.view);
        globalThis.__PIXI_APP__ = Game.APP;

        HitSample.masterGainNode = audioCtx.createGain();
        HitSample.masterGainNode.gain.value = hsVol * masterVol;
        HitSample.masterGainNode.connect(audioCtx.destination);
    }
}
