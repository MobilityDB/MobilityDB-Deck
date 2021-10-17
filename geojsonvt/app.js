import React, {useEffect, useState} from "react";
import {render} from 'react-dom';
import DeckGL from '@deck.gl/react';
import FPSStats from "react-fps-stats";
import {StaticMap} from "react-map-gl";
import {PathLayer, GeoJsonLayer} from '@deck.gl/layers'
import geojsonvt from 'geojson-vt';
import {Matrix4} from 'math.gl';
import {COORDINATE_SYSTEM} from '@deck.gl/core';
import {MVTLayer, TripsLayer} from '@deck.gl/geo-layers';
import {BrowserRouter as Router, useLocation} from "react-router-dom";

const WORLD_SIZE = 512;
const DATA_URL = 'http://localhost:8003/trips0_005.json'; // using cors_http_server.py
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json';
const INITIAL_VIEW_STATE = {
    //berlin
    longitude: 13.383406,
    latitude: 52.515338,
    zoom: 11,
    minZoom: 0,
    maxZoom: 23
};

// animation start and end in unix timestamp
const min_timestamp = 1180324800;
const max_timestamp = 1180339200;
const EXTENT = 4096;
const MAX_ZOOM = 23;

function vectorTileToGeoJSON(tile) {
    const result = [];
    for (const feature of tile.features) {
        result.push(featureToGeoJSON(feature));
    }
    return result;
}

function featureToGeoJSON(feature) {
    const types = ['Unknown', 'Point', 'LineString', 'Polygon'];
    let type = types[feature.type];
    let geometry = feature.geometry;

    if (geometry.length === 1) {
        geometry = geometry[0];
    } else {
        type = `Multi${type}`;
    }

    return {
        type: "Feature",
        geometry: {
            type,
            coordinates: geometry
        },
        properties: feature.tags
    };
}


function useQuery() {
    return new URLSearchParams(useLocation().search);
}

export default function App({
    trailLength = 180,
    loopLength = max_timestamp-min_timestamp,
    animationSpeed = 5
}) {

    let data_url = DATA_URL;
    let query = useQuery();
    let file_path = query.get("file");
    if (file_path) {
        data_url = file_path;
    }

    const [tileIndex, setTileIndex] = useState(null);
    const [time, setTime] = useState(0);
    const [animation] = useState({});

    const animate = () => {
        setTime(t => (t + animationSpeed) % loopLength);
        animation.id = window.requestAnimationFrame(animate);
    };

    useEffect(
        () => {
            animation.id = window.requestAnimationFrame(animate);
            return () => window.cancelAnimationFrame(animation.id);
        },
        [animation]
    );

    const loadTileIndex = async () => {
        fetch(data_url).then(r => r.json()).then(d => {
            setTileIndex(geojsonvt(d, {extent: EXTENT, maxZoom: MAX_ZOOM, vertexTags: ["timestamps"]}));
            console.log(`index finished - ${d["features"].length} features`);
            // console.log(d["features"].map(f => f.geometry.coordinates.length).reduce((a,b) => a+b));
        });
    };

    const fetchData = (url) => {
        let _url = url.split("/");
        const x = parseInt(_url[0]);
        const y = parseInt(_url[1]);
        const z = parseInt(_url[2]);
        return getTileData({x, y, z});
    }

    const getTileData = (tile) => {
        if (tileIndex) {
            const tileData = tileIndex.getTile(tile.z, tile.x, tile.y);
            if (tileData) {
                return vectorTileToGeoJSON(tileData);
            }
        }
        return null;
    }

    const layer = new MVTLayer({
        id: 'mvt-layer',
        data: "{x}/{y}/{z}",
        currentTime: time,
        fetch: fetchData,
        renderSubLayers: props => {
            const {tile} = props;
            const {bbox: {west, south, east, north}} = tile;

            const worldScale = Math.pow(2, tile.z);
            const xScale = WORLD_SIZE / worldScale / EXTENT;
            const yScale = -xScale;
            const xOffset = (WORLD_SIZE * tile.x) / worldScale;
            const yOffset = WORLD_SIZE * (1 - tile.y / worldScale);

            props.modelMatrix = new Matrix4().scale([xScale, yScale, 1]);
            props.coordinateOrigin = [xOffset, yOffset, 0];
            props.coordinateSystem = COORDINATE_SYSTEM.CARTESIAN;
            props.extensions = [];

            return [
                // new GeoJsonLayer({...props, lineWidthMinPixels: 1, getLineColor: [0, 0, 255]}),
                new TripsLayer(props, {
                    data: props.data,
                    getPath: d => d.geometry.coordinates,
                    getTimestamps: d => d.properties.timestamps.map(t => t - min_timestamp),
                    getColor: [255, 0, 0],
                    opacity: 0.6,
                    widthMinPixels: 3,
                    rounded: true,
                    trailLength,
                }),
                // new PathLayer({
                //     id: `${props.id}-border`,
                //     data: [[[west, north], [west, south], [east, south], [east, north], [west, north]]],
                //     getPath: d => d,
                //     getColor: [255, 0, 0],
                //     widthMinPixels: 1,
                // })
            ];
        }
    });

    useEffect(() => {
        loadTileIndex();
        return () => {
        };
    }, []);

    return (
        <DeckGL
            layers={[tileIndex && layer]}
            initialViewState={INITIAL_VIEW_STATE}
            controller={true}
        >
            <StaticMap mapStyle={MAP_STYLE}/>
        </DeckGL>
    );
}

export function renderToDOM(container) {
    render(<Router><App /><FPSStats /></Router>, container);
}
