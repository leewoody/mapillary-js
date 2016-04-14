/// <reference path="../../typings/browser.d.ts" />

import * as rx from "rx";
import * as THREE from "three";
import * as vd from "virtual-dom";

import {ISpriteAtlas} from "../Viewer";

class SpriteAtlas implements ISpriteAtlas {
    private _image: HTMLImageElement;
    private _width: number;
    private _height: number;
    private _json: ISprites;

    public set json(value: ISprites) {
        this._json = value;
    }

    public set image(value: HTMLImageElement) {
        this._image = value;
        this._width = value.width;
        this._height = value.height;
    }

    public get loaded(): boolean {
        return !!(this._image && this._json);
    }

    public getGLSprite(name: string): THREE.Sprite {
        if (!this.loaded) {
            throw new Error("Sprites cannot be retrieved before the atlas is loaded.");
        }

        let texture: THREE.Texture = new THREE.Texture(this._image);
        texture.minFilter = THREE.NearestFilter;
        texture.needsUpdate = true;

        let definition: ISprite = this._json[name];

        texture.offset.x = definition.x / this._width;
        texture.offset.y = (this._height - definition.y - definition.height) / this._height;
        texture.repeat.x = definition.width / this._width;
        texture.repeat.y = definition.height / this._height;

        let material: THREE.SpriteMaterial = new THREE.SpriteMaterial({ map: texture });

        return new THREE.Sprite(material);
    }

    public getDOMSprite(name: string): vd.VNode {
        if (!this.loaded) {
            throw new Error("Sprites cannot be retrieved before the atlas is loaded.");
        }

        let definition: ISprite = this._json[name];

        let clipTop: number = definition.y;
        let clipRigth: number = definition.x + definition.width;
        let clipBottom: number = definition.y + definition.height;
        let clipLeft: number = definition.x;

        let translationX: number = -definition.x;
        let translationY: number = -definition.y;

        let properties: vd.createProperties = {
            src: this._image.src,
            style: {
                clip: `rect(${clipTop}px, ${clipRigth}px, ${clipBottom}px, ${clipLeft}px)`,
                left: `${translationX}px`,
                position: "absolute",
                top: `${translationY}px`,
            },
        };

        return vd.h("img", properties, []);
    }
}

interface ISprite {
    width: number;
    height: number;
    x: number;
    y: number;
    pixelRatio: number;
}

interface ISprites {
    [key: string]: ISprite;
}

interface ISpriteAtlasOperation {
    (atlas: SpriteAtlas): SpriteAtlas;
}

export class SpriteService {
    private _spriteAtlasOperation$: rx.Subject<ISpriteAtlasOperation>;
    private _spriteAtlas$: rx.Observable<SpriteAtlas>;

    constructor(sprite?: string) {
        this._spriteAtlasOperation$ = new rx.Subject<ISpriteAtlasOperation>();

        this._spriteAtlas$ = this._spriteAtlasOperation$
            .startWith(
                (atlas: SpriteAtlas): SpriteAtlas => {
                    return atlas;
                })
            .scan<SpriteAtlas>(
                (atlas: SpriteAtlas, operation: ISpriteAtlasOperation): SpriteAtlas => {
                    return operation(atlas);
                },
                new SpriteAtlas())
            .shareReplay(1);

        this._spriteAtlas$.subscribe();

        if (sprite == null) {
            return;
        }

        let imageXmlHTTP: XMLHttpRequest = new XMLHttpRequest();
        imageXmlHTTP.open("GET", sprite + ".png", true);
        imageXmlHTTP.responseType = "arraybuffer";
        imageXmlHTTP.onload = (e: any) => {
            let image: HTMLImageElement = new Image();
            image.onload = () => {
                this._spriteAtlasOperation$.onNext(
                    (atlas: SpriteAtlas): SpriteAtlas => {
                        atlas.image = image;

                        return atlas;
                    });
            };

            let blob: Blob = new Blob([imageXmlHTTP.response]);
            image.src = window.URL.createObjectURL(blob);
        };

        imageXmlHTTP.send();

        let jsonXmlHTTP: XMLHttpRequest = new XMLHttpRequest();
        jsonXmlHTTP.open("GET", sprite + ".json", true);
        jsonXmlHTTP.responseType = "text";
        jsonXmlHTTP.onload = () => {
            let json: ISprites = <ISprites>JSON.parse(jsonXmlHTTP.response);

            this._spriteAtlasOperation$.onNext(
                    (atlas: SpriteAtlas): SpriteAtlas => {
                        atlas.json = json;

                        return atlas;
                    });
        };

        jsonXmlHTTP.send();
    }

    public get spriteAtlas$(): rx.Observable<ISpriteAtlas> {
        return this._spriteAtlas$;
    }
}

export default SpriteService;
