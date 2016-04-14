import {GLRenderer, DOMRenderer, RenderService, RenderMode} from "../Render";
import {StateService} from "../State";
import {MouseService, TouchService, SpriteService} from "../Viewer";

export class Container {
    public id: string;
    public element: HTMLElement;

    public renderService: RenderService;

    public glRenderer: GLRenderer;
    public domRenderer: DOMRenderer;

    public mouseService: MouseService;
    public touchService: TouchService;

    public spriteService: SpriteService;

    constructor (id: string, stateService: StateService, renderMode: RenderMode) {
        this.id = id;
        this.element = document.getElementById(id);
        this.element.classList.add("mapillary-js");

        this.renderService = new RenderService(this.element, stateService.currentState$, renderMode);

        this.glRenderer = new GLRenderer(this.renderService);
        this.domRenderer = new DOMRenderer(this.element, this.renderService, stateService.currentState$);

        this.mouseService = new MouseService(this.element);
        this.touchService = new TouchService(this.element);

        this.spriteService = new SpriteService();
    }
}

export default Container;
