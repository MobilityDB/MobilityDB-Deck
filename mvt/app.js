import React, {useEffect, useState} from 'react';
import {render} from 'react-dom';
import DeckGL from '@deck.gl/react';
import FPSStats from "react-fps-stats";
import {MVTLayer, TripsLayer} from '@deck.gl/geo-layers';
import {StaticMap} from "react-map-gl";
import {BrowserRouter as Router, useLocation} from "react-router-dom";

const DATA_URL = 'http://localhost:7800/public.trips0_005/{z}/{x}/{y}.pbf?limit=-1'; // pg_tileserv URL
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

function useQuery() {
    return new URLSearchParams(useLocation().search);
}

export default function App({
    trailLength = 180,
    loopLength = max_timestamp-min_timestamp,
    animationSpeed = 5
}) {

    let data = DATA_URL;
    let query = useQuery();
    let table = query.get("table");
    if (table) {
        data = `http://localhost:7800/public.${table}/{z}/{x}/{y}.pbf?limit=-1`;
    }

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

    const onTileLoad = (tile) => {
        const features = [];
        if (tile.content && tile.content.length > 0) {
            for (const feature of tile.content) {
                const ts = feature.properties.times;
                const ts_final = ts.substring(1, ts.length - 1).split(",").map(t => parseInt(t, 10)-min_timestamp);

                // slice Multi into individual features
                if (feature.geometry.type === "MultiLineString") {
                    let index = 0;
                    for (const coords of feature.geometry.coordinates) {
                        const ts_segment = ts_final.slice(index, index + coords.length)
                        features.push({
                            ...feature,
                            geometry: {type: "LineString", coordinates: coords},
                            // properties: {...feature.properties, timestamps: ts_segment}
                            properties: {timestamps: ts_segment}
                        });
                        index = coords.length;
                    }
                } else {
                    // features.push({...feature, properties: {...feature.properties, timestamps: ts_final}});
                    features.push({...feature, properties: {tripid: feature.properties.tripid, timestamps: ts_final}});
                }
            }
        }
        tile.content = features;
    };

    const layer = new MVTLayer({
        id: 'trips',
        data,
        binary: false,
        minZoom: 0,
        maxZoom: 23,
        lineWidthMinPixels: 1,
        onTileLoad: onTileLoad,
        currentTime: time, // it has to be here, not inside the TripsLayer
        // loadOptions: {mode: 'no-cors'},
        renderSubLayers: props => {
            console.log(props.data);
            // return new GeoJsonLayer(props);
            return new TripsLayer(props, {
                data: props.data,
                getPath: d => d.geometry.coordinates,
                getTimestamps: d => d.properties.timestamps,
                getColor: d => d.properties.vendor ? [255, 0, 0] : [0, 0, 255],
                opacity: 0.5,
                widthMinPixels: 2,
                rounded: true,
                trailLength,
            });
        }
    });

    return (
        <DeckGL
            layers={[layer]}
            initialViewState={INITIAL_VIEW_STATE}
            controller={true}
        >
            <StaticMap mapStyle={MAP_STYLE} />
        </DeckGL>
    );
}

export function renderToDOM(container) {
    render(<Router><App /><FPSStats /></Router>, container);
}
