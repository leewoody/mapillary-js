import {throwError as observableThrowError, Observable} from "rxjs";

import {first} from "rxjs/operators";
import * as when from "when";

import {ILatLon} from "../API";
import {EdgeDirection} from "../Edge";
import {
    FilterExpression,
    Node,
} from "../Graph";
import {
    ComponentController,
    Container,
    IViewerOptions,
    Navigator,
    Observer,
} from "../Viewer";
import {
    Component,
    IComponentConfiguration,
} from "../Component";
import {
    EventEmitter,
    Settings,
    Urls,
} from "../Utils";
import {RenderMode} from "../Render";
import {TransitionMode} from "../State";

/**
 * @class Viewer
 *
 * @classdesc The Viewer object represents the navigable image viewer.
 * Create a Viewer by specifying a container, client ID, image key and
 * other options. The viewer exposes methods and events for programmatic
 * interaction.
 *
 * In the case of asynchronous methods, MapillaryJS returns promises to
 * the results. Notifications are always emitted through JavaScript events.
 *
 * The viewer works with a few different coordinate systems.
 *
 * Container pixel coordinates
 *
 * Pixel coordinates are coordinates on the viewer container. The origin is
 * in the top left corner of the container. The axes are
 * directed according to the following for a viewer container with a width
 * of 640 pixels and height of 480 pixels.
 *
 * ```
 * (0,0)                          (640, 0)
 *      +------------------------>
 *      |
 *      |
 *      |
 *      v                        +
 * (0, 480)                       (640, 480)
 * ```
 *
 * Basic image coordinates
 *
 * Basic image coordinates represents points in the original image adjusted for
 * orientation. They range from 0 to 1 on both axes. The origin is in the top left
 * corner of the image and the axes are directed
 * according to the following for all image types.
 *
 * ```
 * (0,0)                          (1, 0)
 *      +------------------------>
 *      |
 *      |
 *      |
 *      v                        +
 * (0, 1)                         (1, 1)
 * ```
 *
 * For every camera viewing direction it is possible to convert between these
 * two coordinate systems for the current node. The image can be panned and
 * zoomed independently of the size of the viewer container resulting in
 * different conversion results for different viewing directions.
 */
export class Viewer extends EventEmitter {
    /**
     * Fired when the viewing direction of the camera changes.
     *
     * @description Related to the computed compass angle
     * ({@link Node.computedCA}) from SfM, not the original EXIF compass
     * angle.
     *
     * @event
     * @type {number} bearing - Value indicating the current bearing
     * measured in degrees clockwise with respect to north.
     */
    public static bearingchanged: string = "bearingchanged";

    /**
     * Fired when a pointing device (usually a mouse) is pressed and released at
     * the same point in the viewer.
     * @event
     * @type  {@link IViewerMouseEvent} event - Viewer mouse event data.
     */
    public static click: string = "click";

    /**
     * Fired when the right button of the mouse is clicked within the viewer.
     * @event
     * @type  {@link IViewerMouseEvent} event - Viewer mouse event data.
     */
    public static contextmenu: string = "contextmenu";

    /**
     * Fired when a pointing device (usually a mouse) is clicked twice at
     * the same point in the viewer.
     * @event
     * @type  {@link IViewerMouseEvent} event - Viewer mouse event data.
     */
    public static dblclick: string = "dblclick";

    /**
     * Fired when the viewer is loading more data.
     * @event
     * @type {boolean} loading - Boolean indicating whether the viewer is loading.
     */
    public static loadingchanged: string = "loadingchanged";

    /**
     * Fired when a pointing device (usually a mouse) is pressed within the viewer.
     * @event
     * @type  {@link IViewerMouseEvent} event - Viewer mouse event data.
     */
    public static mousedown: string = "mousedown";

    /**
     * Fired when a pointing device (usually a mouse) is moved within the viewer.
     * @description Will not fire when the mouse is actively used, e.g. for drag pan.
     * @event
     * @type  {@link IViewerMouseEvent} event - Viewer mouse event data.
     */
    public static mousemove: string = "mousemove";

    /**
     * Fired when a pointing device (usually a mouse) leaves the viewer's canvas.
     * @event
     * @type  {@link IViewerMouseEvent} event - Viewer mouse event data.
     */
    public static mouseout: string = "mouseout";

    /**
     * Fired when a pointing device (usually a mouse) is moved onto the viewer's canvas.
     * @event
     * @type  {@link IViewerMouseEvent} event - Viewer mouse event data.
     */
    public static mouseover: string = "mouseover";

    /**
     * Fired when a pointing device (usually a mouse) is released within the viewer.
     * @event
     * @type  {@link IViewerMouseEvent} event - Viewer mouse event data.
     */
    public static mouseup: string = "mouseup";

    /**
     * Fired when the viewer motion stops and it is in a fixed
     * position with a fixed point of view.
     * @event
     */
    public static moveend: string = "moveend";

    /**
     * Fired when the motion from one view to another start,
     * either by changing the position (e.g. when changing node) or
     * when changing point of view (e.g. by interaction such as pan and zoom).
     * @event
     */
    public static movestart: string = "movestart";

    /**
     * Fired when the navigable state of the viewer changes.
     *
     * @description The navigable state indicates if the viewer supports
     * moving, i.e. calling the `moveToKey`, `moveDir` and `moveCloseTo`
     * methods. The viewer will not be in a navigable state if the cover
     * is activated and the viewer has been supplied a key. When the cover
     * is deactivated or activated without being supplied a key it will
     * be navigable.
     *
     * @event
     * @type {boolean} navigable - Boolean indicating whether the viewer is navigable.
     */
    public static navigablechanged: string = "navigablechanged";

    /**
     * Fired every time the viewer navigates to a new node.
     * @event
     * @type  {@link Node} node - Current node.
     */
    public static nodechanged: string = "nodechanged";

    /**
     * Fired every time the sequence edges of the current node changes.
     * @event
     * @type  {@link IEdgeStatus} status - The edge status object.
     */
    public static sequenceedgeschanged: string = "sequenceedgeschanged";

    /**
     * Fired every time the spatial edges of the current node changes.
     * @event
     * @type  {@link IEdgeStatus} status - The edge status object.
     */
    public static spatialedgeschanged: string = "spatialedgeschanged";

    /**
     * Private component controller object which manages component states.
     */
    private _componentController: ComponentController;

    /**
     * Private container object which maintains the DOM Element,
     * renderers and relevant services.
     */
    private _container: Container;

    /**
     * Private observer object which observes the viewer state and
     * fires events on behalf of the viewer.
     */
    private _observer: Observer;

    /**
     * Private navigator object which controls navigation throught
     * the vast seas of Mapillary.
     */
    private _navigator: Navigator;

    /**
     * Create a new viewer instance.
     *
     * @description It is possible to initialize the viewer with or
     * without a key.
     *
     * When you want to show a specific image in the viewer from
     * the start you should initialize it with a key.
     *
     * When you do not know the first image key at implementation
     * time, e.g. in a map-viewer application you should initialize
     * the viewer without a key and call `moveToKey` instead.
     *
     * When initializing with a key the viewer is bound to that key
     * until the node for that key has been successfully loaded.
     * Also, a cover with the image of the key will be shown.
     * If the data for that key can not be loaded because the key is
     * faulty or other errors occur it is not possible to navigate
     * to another key because the viewer is not navigable. The viewer
     * becomes navigable when the data for the key has been loaded and
     * the image is shown in the viewer. This way of initializing
     * the viewer is mostly for embedding in blog posts and similar
     * where one wants to show a specific image initially.
     *
     * If the viewer is initialized without a key (with null or
     * undefined) it is not bound to any particular key and it is
     * possible to move to any key with `viewer.moveToKey("<my-image-key>")`.
     * If the first move to a key fails it is possible to move to another
     * key. The viewer will show a black background until a move
     * succeeds. This way of intitializing is suited for a map-viewer
     * application when the initial key is not known at implementation
     * time.
     *
     * @param {string} id - Required `id` of a DOM element which will
     * be transformed into the viewer.
     * @param {string} clientId - Required `Mapillary API ClientID`. Can
     * be obtained from https://www.mapillary.com/app/settings/developers.
     * @param {string} key - Optional `image-key` to start from. The key
     * can be any Mapillary image. If a key is provided the viewer is
     * bound to that key until it has been fully loaded. If null is provided
     * no image is loaded at viewer initialization and the viewer is not
     * bound to any particular key. Any image can then be navigated to
     * with e.g. `viewer.moveToKey("<my-image-key>")`.
     * @param {IViewerOptions} options - Optional configuration object
     * specifing Viewer's and the components' initial setup.
     * @param {string} token - Optional bearer token for API requests of
     * protected resources.
     *
     * @example
     * ```
     * var viewer = new Mapillary.Viewer("<element-id>", "<client-id>", "<image-key>");
     * ```
     */
    constructor (id: string, clientId: string, key?: string, options?: IViewerOptions, token?: string) {
        super();

        options = options != null ? options : {};

        Settings.setOptions(options);
        Urls.setOptions(options.url);

        this._navigator = new Navigator(clientId, options, token);
        this._container = new Container(id, this._navigator.stateService, options);
        this._observer = new Observer(this, this._navigator, this._container);
        this._componentController = new ComponentController(this._container, this._navigator, this._observer, key, options.component);
    }

    /**
     * Return a boolean indicating if the viewer is in a navigable state.
     *
     * @description The navigable state indicates if the viewer supports
     * moving, i.e. calling the {@link moveToKey}, {@link moveDir}
     * and {@link moveCloseTo} methods or changing the authentication state,
     * i.e. calling {@link setAuthToken}. The viewer will not be in a navigable
     * state if the cover is activated and the viewer has been supplied a key.
     * When the cover is deactivated or the viewer is activated without being
     * supplied a key it will be navigable.
     *
     * @returns {boolean} Boolean indicating whether the viewer is navigable.
     */
    public get isNavigable(): boolean {
        return this._componentController.navigable;
    }

    /**
     * Activate the combined panning functionality.
     *
     * @description The combined panning functionality is active by default.
     */
    public activateCombinedPanning(): void {
        this._navigator.panService.enable();
    }

    /**
     * Activate a component.
     *
     * @param {string} name - Name of the component which will become active.
     *
     * @example
     * ```
     * viewer.activateComponent("marker");
     * ```
     */
    public activateComponent(name: string): void {
        this._componentController.activate(name);
    }

    /**
     * Activate the cover (deactivates all other components).
     */
    public activateCover(): void {
        this._componentController.activateCover();
    }

    /**
     * Deactivate the combined panning functionality.
     *
     * @description Deactivating the combined panning functionality
     * could be needed in scenarios involving sequence only navigation.
     */
    public deactivateCombinedPanning(): void {
        this._navigator.panService.disable();
    }

    /**
     * Deactivate a component.
     *
     * @param {string} name - Name of component which become inactive.
     *
     * @example
     * ```
     * viewer.deactivateComponent("mouse");
     * ```
     */
    public deactivateComponent(name: string): void {
        this._componentController.deactivate(name);
    }

    /**
     * Deactivate the cover (activates all components marked as active).
     */
    public deactivateCover(): void {
        this._componentController.deactivateCover();
    }

    /**
     * Get the bearing of the current viewer camera.
     *
     * @description The bearing depends on how the camera
     * is currently rotated and does not correspond
     * to the compass angle of the current node if the view
     * has been panned.
     *
     * Bearing is measured in degrees clockwise with respect to
     * north.
     *
     * @returns {Promise<number>} Promise to the bearing
     * of the current viewer camera.
     *
     * @example
     * ```
     * viewer.getBearing().then((b) => { console.log(b); });
     * ```
     */
    public getBearing(): when.Promise<number> {
        return when.promise<number>(
            (resolve: (value: number) => void, reject: (reason: Error) => void): void => {
                this._container.renderService.bearing$.pipe(
                    first())
                    .subscribe(
                        (bearing: number): void => {
                            resolve(bearing);
                        },
                        (error: Error): void => {
                            reject(error);
                        });
            });
    }

    /**
     * Get the basic coordinates of the current image that is
     * at the center of the viewport.
     *
     * @description Basic coordinates are 2D coordinates on the [0, 1] interval
     * and have the origin point, (0, 0), at the top left corner and the
     * maximum value, (1, 1), at the bottom right corner of the original
     * image.
     *
     * @returns {Promise<number[]>} Promise to the basic coordinates
     * of the current image at the center for the viewport.
     *
     * @example
     * ```
     * viewer.getCenter().then((c) => { console.log(c); });
     * ```
     */
    public getCenter(): when.Promise<number[]> {
        return when.promise<number[]>(
            (resolve: (value: number[]) => void, reject: (reason: Error) => void): void => {
                this._navigator.stateService.getCenter()
                    .subscribe(
                        (center: number[]): void => {
                            resolve(center);
                        },
                        (error: Error): void => {
                            reject(error);
                        });
            });
    }

    /**
     * Get a component.
     *
     * @param {string} name - Name of component.
     * @returns {Component} The requested component.
     *
     * @example
     * ```
     * var mouseComponent = viewer.getComponent("mouse");
     * ```
     */
    public getComponent<TComponent extends Component<IComponentConfiguration>>(name: string): TComponent {
        return this._componentController.get<TComponent>(name);
    }

    /**
     * Returns the viewer's containing HTML element.
     *
     * @returns {HTMLElement} The viewer's container.
     */
    public getContainer(): HTMLElement {
        return this._container.element;
    }

    /**
     * Get the image's current zoom level.
     *
     * @returns {Promise<number>} Promise to the viewers's current
     * zoom level.
     *
     * @example
     * ```
     * viewer.getZoom().then((z) => { console.log(z); });
     * ```
     */
    public getZoom(): when.Promise<number> {
         return when.promise<number>(
            (resolve: (value: number) => void, reject: (reason: Error) => void): void => {
                this._navigator.stateService.getZoom()
                    .subscribe(
                        (zoom: number): void => {
                            resolve(zoom);
                        },
                        (error: Error): void => {
                            reject(error);
                        });
            });
    }

    /**
     * Move close to given latitude and longitude.
     *
     * @description Because the method propagates IO errors, these potential errors
     * need to be handled by the method caller (see example).
     *
     * @param {Number} lat - Latitude, in degrees.
     * @param {Number} lon - Longitude, in degrees.
     * @returns {Promise<Node>} Promise to the node that was navigated to.
     * @throws {Error} If no nodes exist close to provided latitude
     * longitude.
     * @throws {Error} Propagates any IO errors to the caller.
     * @throws {Error} When viewer is not navigable.
     * @throws  {@link AbortMapillaryError} When a subsequent move request is made
     * before the move close to call has completed.
     *
     * @example
     * ```
     * viewer.moveCloseTo(0, 0).then(
     *     (n) => { console.log(n); },
     *     (e) => { console.error(e); });
     * ```
     */
    public moveCloseTo(lat: number, lon: number): when.Promise<Node> {
        const moveCloseTo$: Observable<Node> = this.isNavigable ?
            this._navigator.moveCloseTo$(lat, lon) :
            observableThrowError(new Error("Calling moveCloseTo is not supported when viewer is not navigable."));

        return when.promise<Node>(
            (resolve: (value: Node) => void, reject: (reason: Error) => void): void => {
                moveCloseTo$.subscribe(
                    (node: Node): void => {
                        resolve(node);
                    },
                    (error: Error): void => {
                        reject(error);
                    });
            });
    }

    /**
     * Navigate in a given direction.
     *
     * @description This method has to be called through EdgeDirection enumeration as in the example.
     *
     * @param {EdgeDirection} dir - Direction in which which to move.
     * @returns {Promise<Node>} Promise to the node that was navigated to.
     * @throws {Error} If the current node does not have the edge direction
     * or the edges has not yet been cached.
     * @throws {Error} Propagates any IO errors to the caller.
     * @throws {Error} When viewer is not navigable.
     * @throws  {@link AbortMapillaryError} When a subsequent move request is made
     * before the move dir call has completed.
     *
     * @example
     * ```
     * viewer.moveDir(Mapillary.EdgeDirection.Next).then(
     *     (n) => { console.log(n); },
     *     (e) => { console.error(e); });
     * ```
     */
    public moveDir(dir: EdgeDirection): when.Promise<Node> {
        const moveDir$: Observable<Node> = this.isNavigable ?
            this._navigator.moveDir$(dir) :
            observableThrowError(new Error("Calling moveDir is not supported when viewer is not navigable."));

        return when.promise<Node>(
            (resolve: (value: Node) => void, reject: (reason: Error) => void): void => {
                moveDir$.subscribe(
                    (node: Node): void => {
                        resolve(node);
                    },
                    (error: Error): void => {
                        reject(error);
                    });
            });
    }

    /**
     * Navigate to a given image key.
     *
     * @param {string} key - A valid Mapillary image key.
     * @returns {Promise<Node>} Promise to the node that was navigated to.
     * @throws {Error} Propagates any IO errors to the caller.
     * @throws {Error} When viewer is not navigable.
     * @throws  {@link AbortMapillaryError} When a subsequent move request is made
     * before the move to key call has completed.
     *
     * @example
     * ```
     * viewer.moveToKey("<my key>").then(
     *     (n) => { console.log(n); },
     *     (e) => { console.error(e); });
     * ```
     */
    public moveToKey(key: string): when.Promise<Node> {
        const moveToKey$: Observable<Node> = this.isNavigable ?
            this._navigator.moveToKey$(key) :
            observableThrowError(new Error("Calling moveToKey is not supported when viewer is not navigable."));

        return when.promise<Node>(
            (resolve: (value: Node) => void, reject: (reason: Error) => void): void => {
                moveToKey$.subscribe(
                    (node: Node): void => {
                        resolve(node);
                    },
                    (error: Error): void => {
                        reject(error);
                    });
            });
    }

    /**
     * Project basic image coordinates for the current node to canvas pixel
     * coordinates.
     *
     * @description The basic image coordinates may not always correspond to a
     * pixel point that lies in the visible area of the viewer container.
     *
     * @param {Array<number>} basicPoint - Basic images coordinates to project.
     * @returns {Promise<Array<number>>} Promise to the pixel coordinates corresponding
     * to the basic image point.
     *
     * @example
     * ```
     * viewer.projectFromBasic([0.3, 0.7])
     *     .then((pixelPoint) => { console.log(pixelPoint); });
     * ```
     */
    public projectFromBasic(basicPoint: number[]): when.Promise<number[]> {
        return when.promise<number[]>(
            (resolve: (value: number[]) => void, reject: (reason: Error) => void): void => {
                this._observer.projectBasic$(basicPoint)
                    .subscribe(
                        (pixelPoint: number[]): void => {
                            resolve(pixelPoint);
                        },
                        (error: Error): void => {
                            reject(error);
                        });
            });
    }

    /**
     * Detect the viewer's new width and height and resize it.
     *
     * @description The components will also detect the viewer's
     * new size and resize their rendered elements if needed.
     *
     * @example
     * ```
     * viewer.resize();
     * ```
     */
    public resize(): void {
        this._container.renderService.resize$.next(null);
    }

    /**
     * Set a bearer token for authenticated API requests of
     * protected resources.
     *
     * @description When the supplied token is null or undefined,
     * any previously set bearer token will be cleared and the
     * viewer will make unauthenticated requests.
     *
     * Calling setAuthToken aborts all outstanding move requests.
     * The promises of those move requests will be rejected with a
     * {@link AbortMapillaryError} the rejections need to be caught.
     *
     * Calling setAuthToken also resets the complete viewer cache
     * so it should not be called repeatedly.
     *
     * @param {string} [token] token - Bearer token.
     * @returns {Promise<void>} Promise that resolves after token
     * is set.
     *
     * @throws {Error} When viewer is not navigable.
     *
     * @example
     * ```
     * viewer.setAuthToken("<my token>")
     *     .then(() => { console.log("token set"); });
     * ```
     */
    public setAuthToken(token?: string): when.Promise<void> {
        const setToken$: Observable<void> = this.isNavigable ?
            this._navigator.setToken$(token) :
            observableThrowError(new Error("Calling setAuthToken is not supported when viewer is not navigable."));

        return when.promise<void>(
            (resolve: (value: void) => void, reject: (reason: Error) => void): void => {
                setToken$
                    .subscribe(
                        (): void => {
                            resolve(undefined);
                        },
                        (error: Error): void => {
                            reject(error);
                        });
            });
    }

    /**
     * Set the basic coordinates of the current image to be in the
     * center of the viewport.
     *
     * @description Basic coordinates are 2D coordinates on the [0, 1] interval
     * and has the origin point, (0, 0), at the top left corner and the
     * maximum value, (1, 1), at the bottom right corner of the original
     * image.
     *
     * @param {number[]} The basic coordinates of the current
     * image to be at the center for the viewport.
     *
     * @example
     * ```
     * viewer.setCenter([0.5, 0.5]);
     * ```
     */
    public setCenter(center: number[]): void {
        this._navigator.stateService.setCenter(center);
    }

    /**
     * Set the filter selecting nodes to use when calculating
     * the spatial edges.
     *
     * @description The following filter types are supported:
     *
     * Comparison
     *
     * `["==", key, value]` equality: `node[key] = value`
     *
     * `["!=", key, value]` inequality: `node[key] ≠ value`
     *
     * `["<", key, value]` less than: `node[key] < value`
     *
     * `["<=", key, value]` less than or equal: `node[key] ≤ value`
     *
     * `[">", key, value]` greater than: `node[key] > value`
     *
     * `[">=", key, value]` greater than or equal: `node[key] ≥ value`
     *
     * Set membership
     *
     * `["in", key, v0, ..., vn]` set inclusion: `node[key] ∈ {v0, ..., vn}`
     *
     * `["!in", key, v0, ..., vn]` set exclusion: `node[key] ∉ {v0, ..., vn}`
     *
     * Combining
     *
     * `["all", f0, ..., fn]` logical `AND`: `f0 ∧ ... ∧ fn`
     *
     * A key must be a string that identifies a property name of a
     * simple {@link Node} property. A value must be a string, number, or
     * boolean. Strictly-typed comparisons are used. The values
     * `f0, ..., fn` of the combining filter must be filter expressions.
     *
     * Clear the filter by setting it to null or empty array.
     *
     * @param {FilterExpression} filter - The filter expression.
     * @returns {Promise<void>} Promise that resolves after filter is applied.
     *
     * @example
     * ```
     * viewer.setFilter(["==", "sequenceKey", "<my sequence key>"]);
     * ```
     */
    public setFilter(filter: FilterExpression): when.Promise<void> {
        return when.promise<void>(
            (resolve: (value: void) => void, reject: (reason: Error) => void): void => {
                this._navigator.setFilter$(filter)
                    .subscribe(
                        (): void => {
                            resolve(undefined);
                        },
                        (error: Error): void => {
                            reject(error);
                        });
            });
    }

    /**
     * Set the viewer's render mode.
     *
     * @param {RenderMode} renderMode - Render mode.
     *
     * @example
     * ```
     * viewer.setRenderMode(Mapillary.RenderMode.Letterbox);
     * ```
     */
    public setRenderMode(renderMode: RenderMode): void {
        this._container.renderService.renderMode$.next(renderMode);
    }

    /**
     * Set the viewer's transition mode.
     *
     * @param {TransitionMode} transitionMode - Transition mode.
     *
     * @example
     * ```
     * viewer.setTransitionMode(Mapillary.TransitionMode.Instantaneous);
     * ```
     */
    public setTransitionMode(transitionMode: TransitionMode): void {
        this._navigator.stateService.setTransitionMode(transitionMode);
    }

    /**
     * Set the image's current zoom level.
     *
     * @description Possible zoom level values are on the [0, 3] interval.
     * Zero means zooming out to fit the image to the view whereas three
     * shows the highest level of detail.
     *
     * @param {number} The image's current zoom level.
     *
     * @example
     * ```
     * viewer.setZoom(2);
     * ```
     */
    public setZoom(zoom: number): void {
        this._navigator.stateService.setZoom(zoom);
    }

    /**
     * Unproject canvas pixel coordinates to an ILatLon representing geographical
     * coordinates.
     *
     * @description The pixel point may not always correspond to geographical
     * coordinates. In the case of no correspondence the returned value will
     * be `null`.
     *
     * @param {Array<number>} pixelPoint - Pixel coordinates to unproject.
     * @returns {Promise<ILatLon>} Promise to the latLon corresponding to the pixel point.
     *
     * @example
     * ```
     * viewer.unproject([100, 100])
     *     .then((latLon) => { console.log(latLon); });
     * ```
     */
    public unproject(pixelPoint: number[]): when.Promise<ILatLon> {
        return when.promise<ILatLon>(
            (resolve: (value: ILatLon) => void, reject: (reason: Error) => void): void => {
                this._observer.unproject$(pixelPoint)
                    .subscribe(
                        (latLon: ILatLon): void => {
                            resolve(latLon);
                        },
                        (error: Error): void => {
                            reject(error);
                        });
            });
    }

    /**
     * Unproject canvas pixel coordinates to basic image coordinates for the
     * current node.
     *
     * @description The pixel point may not always correspond to basic image
     * coordinates. In the case of no correspondence the returned value will
     * be `null`.
     *
     * @param {Array<number>} pixelPoint - Pixel coordinates to unproject.
     * @returns {Promise<ILatLon>} Promise to the basic coordinates corresponding
     * to the pixel point.
     *
     * @example
     * ```
     * viewer.unprojectToBasic([100, 100])
     *     .then((basicPoint) => { console.log(basicPoint); });
     * ```
     */
    public unprojectToBasic(pixelPoint: number[]): when.Promise<number[]> {
        return when.promise<number[]>(
            (resolve: (value: number[]) => void, reject: (reason: Error) => void): void => {
                this._observer.unprojectBasic$(pixelPoint)
                    .subscribe(
                        (basicPoint: number[]): void => {
                            resolve(basicPoint);
                        },
                        (error: Error): void => {
                            reject(error);
                        });
            });
    }
}
