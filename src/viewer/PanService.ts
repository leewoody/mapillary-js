import * as THREE from "three";

import {
    of as observableOf,
    combineLatest as observableCombineLatest,
    Observable,
} from "rxjs";

import {
    map,
    switchMap,
    withLatestFrom,
    share,
    distinctUntilChanged,
} from "rxjs/operators";

import * as Geo from "../geo/Geo";
import GeoCoords from "../geo/GeoCoords";
import GraphService from "../graph/GraphService";
import GraphCalculator from "../graph/GraphCalculator";
import ILatLon from "../api/interfaces/ILatLon";
import ILatLonAlt from "../geo/interfaces/ILatLonAlt";
import Node from "../graph/Node";
import Spatial from "../geo/Spatial";
import { StateService } from "../state/StateService";
import { Transform } from "../geo/Transform";
import ViewportCoords from "../geo/ViewportCoords";
import { IFrame } from "../State";

export class PanService {
    private _graphService: GraphService;
    private _stateService: StateService;
    private _graphCalculator: GraphCalculator;
    private _geoCoords: GeoCoords;
    private _spatial: Spatial;

    private _panNodes$: Observable<[Node, Transform][]>;

    constructor(
        graphService: GraphService,
        stateService: StateService,
        geoCoords?: GeoCoords,
        graphCalculator?: GraphCalculator,
        spatial?: Spatial) {

        this._graphService = graphService;
        this._stateService = stateService;
        this._geoCoords = !!geoCoords ? geoCoords : new GeoCoords();
        this._graphCalculator = !!graphCalculator ? graphCalculator : new GraphCalculator(this._geoCoords);
        this._spatial = !!spatial ? spatial : new Spatial();

        const panNodes$: Observable<[Node, Transform][]> = this._stateService.currentNode$.pipe(
            switchMap(
                (current: Node): Observable<[Node, Transform][]> => {
                    const current$: Observable<Node> = observableOf(current);

                    const bounds: ILatLon[] = this._graphCalculator.boundingBoxCorners(current.computedLatLon, 20);

                    const adjacent$: Observable<Node[]> = this._graphService
                        .cacheBoundingBox$(bounds[0], bounds[1]).pipe(
                            map(
                                (nodes: Node[]): Node[] => {
                                    if (current.pano) {
                                        return [];
                                    }

                                    const potential: Node[] = [];

                                    for (const node of nodes) {
                                        if (node.key === current.key) {
                                            continue;
                                        }

                                        if (node.mergeCC !== current.mergeCC) {
                                            continue;
                                        }

                                        if (node.pano) {
                                            continue;
                                        }

                                        if (this._distance(node, current) > 4) {
                                            continue;
                                        }

                                        potential.push(node);
                                    }

                                    return potential;
                                }));

                    return observableCombineLatest(current$, adjacent$).pipe(
                        withLatestFrom(this._stateService.reference$),
                        map(
                            ([[cn, adjacent], reference]: [[Node, Node[]], ILatLonAlt]): [Node, Transform][] => {
                                const currentDirection: THREE.Vector3 = this._spatial.viewingDirection(cn.rotation);
                                const currentTranslation: number[] = Geo.computeTranslation(
                                    { lat: cn.latLon.lat, lon: cn.latLon.lon, alt: cn.alt },
                                    cn.rotation,
                                    reference);
                                const currentTransform: Transform = this._createTransform(cn, currentTranslation);
                                const currentAzimuthal: number = this._spatial.wrap(
                                    this._spatial.azimuthal(
                                        currentDirection.toArray(),
                                        currentTransform.upVector().toArray()),
                                    0,
                                    2 * Math.PI);

                                const currentProjectedPoints: number[][] = this._computeProjectedPoints(currentTransform);
                                const currentHFov: number = this._computeHorizontalFov(currentProjectedPoints) / 180 * Math.PI;

                                const preferredOverlap: number = Math.PI / 8;
                                let left: [number, Node, Transform] = undefined;
                                let right: [number, Node, Transform] = undefined;

                                for (const a of adjacent) {
                                    const translation: number[] = Geo.computeTranslation(
                                        { lat: a.latLon.lat, lon: a.latLon.lon, alt: a.alt },
                                        a.rotation,
                                        reference);

                                    const transform: Transform = this._createTransform(a, translation);
                                    const projectedPoints: number[][] = this._computeProjectedPoints(transform);
                                    const hFov: number = this._computeHorizontalFov(projectedPoints) / 180 * Math.PI;

                                    const direction: THREE.Vector3 = this._spatial.viewingDirection(a.rotation);
                                    const azimuthal: number = this._spatial.wrap(
                                        this._spatial.azimuthal(
                                            direction.toArray(),
                                            transform.upVector().toArray()),
                                        0,
                                        2 * Math.PI);

                                    const directionChange: number = this._spatial.angleBetweenVector2(
                                        currentDirection.x,
                                        currentDirection.y,
                                        direction.x,
                                        direction.y);

                                    let overlap: number = Number.NEGATIVE_INFINITY;
                                    if (directionChange > 0) {
                                        if (currentAzimuthal > azimuthal) {
                                            overlap = currentAzimuthal - 2 * Math.PI + currentHFov / 2 - (azimuthal - hFov / 2);
                                        } else {
                                            overlap = currentAzimuthal + currentHFov / 2 - (azimuthal - hFov / 2);
                                        }
                                    } else {
                                        if (currentAzimuthal < azimuthal) {
                                            overlap = azimuthal + hFov / 2 - (currentAzimuthal + 2 * Math.PI - currentHFov / 2);
                                        } else {
                                            overlap = azimuthal + hFov / 2 - (currentAzimuthal - currentHFov / 2);
                                        }
                                    }

                                    const distanceCost: number = this._distance(a, cn);
                                    const timeCost: number = Math.min(this._timeDifference(a, cn), 4);
                                    const overlapCost: number = 20 * Math.abs(overlap - preferredOverlap);

                                    const cost: number = distanceCost + timeCost + overlapCost;

                                    if (overlap > 0 && overlap < currentHFov / 2 && overlap < hFov / 2) {
                                        if (directionChange > 0) {
                                            if (!left) {
                                                left = [cost, a, transform];
                                            } else {
                                                if (cost < left[0]) {
                                                    left = [cost, a, transform];
                                                }
                                            }
                                        } else {
                                            if (!right) {
                                                right = [cost, a, transform];
                                            } else {
                                                if (cost < right[0]) {
                                                    right = [cost, a, transform];
                                                }
                                            }
                                        }
                                    }
                                }

                                const panNodes: [Node, Transform][] = [];

                                if (!!left) {
                                    panNodes.push([left[1], left[2]]);
                                }

                                if (!!right) {
                                    panNodes.push([right[1], right[2]]);
                                }

                                return panNodes;
                            }));
                }));

        this._panNodes$ = this._stateService.currentState$.pipe(
            map(
                (frame: IFrame): boolean => {
                    return frame.state.nodesAhead > 0;
                }),
            distinctUntilChanged(),
            switchMap(
                (traversing: boolean): Observable<[Node, Transform][]> => {
                    return traversing ? observableOf([]) : panNodes$;
                }),
            share());
    }

    public get panNodes$(): Observable<[Node, Transform][]> {
        return this._panNodes$;
    }

    private _distance(node: Node, reference: Node): number {
        const [x, y, z]: number[] = this._geoCoords.geodeticToEnu(
            node.latLon.lat,
            node.latLon.lon,
            node.alt,
            reference.latLon.lat,
            reference.latLon.lon,
            reference.alt);

        return Math.sqrt(x * x + y * y + z * z);
    }

    private _timeDifference(node: Node, reference: Node): number {
        return Math.abs(node.capturedAt - reference.capturedAt) / (1000 * 60 * 60 * 24 * 30);
    }

    private _createTransform(node: Node, translation: number[]): Transform {
        return new Transform(
            node.orientation,
            node.width,
            node.height,
            node.focal,
            node.scale,
            node.gpano,
            node.rotation,
            translation,
            node.assetsCached ? node.image : undefined,
            undefined,
            node.ck1,
            node.ck2,
            node.cameraProjection);
    }

    private _computeProjectedPoints(transform: Transform): number[][] {
        const os: number[][] = [[1, 0]];
        const ds: number[][] = [[0, 0.5]];
        const pointsPerSide: number = 20;

        const basicPoints: number[][] = [];

        for (let side: number = 0; side < os.length; ++side) {
            const o: number[] = os[side];
            const d: number[] = ds[side];

            for (let i: number = 0; i <= pointsPerSide; ++i) {
                basicPoints.push([o[0] + d[0] * i / pointsPerSide,
                                o[1] + d[1] * i / pointsPerSide]);
            }
        }

        const camera: THREE.Camera = new THREE.Camera();
        camera.up.copy(transform.upVector());
        camera.position.copy(new THREE.Vector3().fromArray(transform.unprojectSfM([0, 0], 0)));
        camera.lookAt(new THREE.Vector3().fromArray(transform.unprojectSfM([0, 0], 10)));
        camera.updateMatrix();
        camera.updateMatrixWorld(true);

        const viewportCoords: ViewportCoords = new ViewportCoords();

        const projectedPoints: number[][] = basicPoints
            .map(
                (basicPoint: number[]): number[] => {
                    const worldPoint: number[] = transform.unprojectBasic(basicPoint, 10000);
                    const cameraPoint: number[] = viewportCoords.worldToCamera(worldPoint, camera);

                    return [
                        Math.abs(cameraPoint[0] / cameraPoint[2]),
                        Math.abs(cameraPoint[1] / cameraPoint[2]),
                    ];
                });

        return projectedPoints;
    }

    private _computeHorizontalFov(projectedPoints: number[][]): number {
        const fovs: number[] = projectedPoints
            .map(
                (projectedPoint: number[]): number => {
                    return this._coordToFov(projectedPoint[0]);
                });

        const fov: number = Math.min(...fovs);

        return fov;
    }

    private _coordToFov(x: number): number {
        return 2 * Math.atan(x) * 180 / Math.PI;
    }
}
