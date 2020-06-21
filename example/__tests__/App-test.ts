/**
 * @format
 */

import 'react-native';
import React from 'react';
import App from '../App';
import "jest";

const WebSocket = require('ws');
global.WebSocket = WebSocket;

import RobustWs from "../react-native-robust-ws";

// Note: test renderer must be required after react-native.
import renderer from 'react-test-renderer';


test('echos correctly', async () => {
    let cnt = 0;
    const ws = new RobustWs("ws://localhost:8765");

    const session = ws.openSession({
        onMessage: () => cnt++,
    });


    session.send("1");
    session.send("2");
    session.send("3");

    await new Promise(resolve => setTimeout(resolve, 500));
    console.log("closed");
    session.close();
    expect(cnt).toBe(3);
    await new Promise(resolve => setTimeout(resolve, 500));
});

test('ok to open twice', async () => {
    const ws = new RobustWs("ws://localhost:8765");

    const session = ws.openSession({});

    ws.openSession({});

    session.close();
    await new Promise(resolve => setTimeout(resolve, 500));
});

