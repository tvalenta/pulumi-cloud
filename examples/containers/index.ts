// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import fetch from "node-fetch";

// A simple NGINX service, scaled out over two containers.
let nginx = new cloud.Service("nginx", {
    containers: {
        nginx: {
            image: "nginx",
            memory: 128,
            portMappings: [{ containerPort: 80 }],
        },
    },
    scale: 2,
});

// A simple MongoDB service, using a data volume which persists on the backing
// storage beyond the lifetime of the deployment.
let dataVolume = new cloud.Volume("mymongodb-data");
let mongodb = new cloud.Service("mymongodb", {
    containers: {
        mongodb: {
            image: "mongo",
            memory: 128,
            portMappings: [{ containerPort: 27017 }],
            mountPoints: [{ containerPath: "/data/db", sourceVolume: dataVolume }],
        },
    },
});

// TODO: Would be nice if this was a Secret<T> and closure serialization
//       knew to pass it in encrypted env vars.
// TODO: Might also be nice if this could be generated uniquely per stack.
let redisPassword = "SECRETPASSWORD";

/**
 * A simple Cache abstration, built on top of a Redis container Service.
 */
class Cache {

    get: (key: string) => Promise<string>;
    set: (key: string, value: string) => Promise<void>;

    constructor(name: string) {
        let redis = new cloud.Service(name, {
            containers: {
                redis: {
                    image: "redis:alpine",
                    memory: 128,
                    portMappings: [{containerPort: 6379}],
                    command: ["redis-server", "--requirepass", redisPassword],
                },
            },
        });
        this.get = (key: string) => {
            return redis.getEndpoint("redis", 6379).then(endpoint => {
                console.log(`Endpoint: ${endpoint}`);
                let client = require("redis").createClient(endpoint.port, endpoint.hostname, {password: redisPassword});
                console.log(client);
                return new Promise<string>((resolve, reject) => {
                    client.get(key, (err: any, v: any) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(v);
                        }
                    });
                });
            });
        };
        this.set = (key: string, value: string) => {
            return redis.getEndpoint("redis", 6379).then(endpoint => {
                console.log(`Endpoint: ${endpoint}`);
                let client = require("redis").createClient(endpoint.port, endpoint.hostname, {password: redisPassword});
                console.log(client);
                return new Promise<void>((resolve, reject) => {
                    client.set(key, value, (err: any, v: any) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
            });
        };
    }
}

let cache = new Cache("mycache");

let api = new cloud.HttpEndpoint("myendpoint");
api.get("/test", async (req, res) => {
    res.json({
        nginx: await nginx.getEndpoint(),
        mongodb: await mongodb.getEndpoint(),
    });
});
api.get("/", async (req, res) => {
    try {
        // Use the NGINX or Redis Services to respond to the request.
        console.log("handling /");
        let page = await cache.get("page");
        if (page) {
            res.setHeader("X-Powered-By", "redis");
            res.end(page);
            return;
        }
        let endpoint = await nginx.getEndpoint("nginx", 80);
        console.log("got host and port:" + endpoint);
        let resp = await fetch(`http://${endpoint.hostname}:${endpoint.port}/`);
        let buffer = await resp.buffer();
        console.log(buffer.toString());
        await cache.set("page", buffer.toString());
        res.setHeader("X-Powered-By", "nginx");
        res.end(buffer);
    } catch (err) {
        console.error(err);
        res.status(500).end(`Pulumi proxy service error: ${err}`);
    }
});
api.publish().then(url => console.log(`Serving at: ${url}`));
