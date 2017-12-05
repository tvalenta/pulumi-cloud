// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as pulumi from "pulumi";
import { createNameWithStackInfo } from "./shared";

// The type of the Lambda payload from Cloudwatch Logs subscriptions.
// See http://docs.aws.amazon.com/lambda/latest/dg/eventsources.html#eventsources-cloudwatch-logs
interface LogsPayload {
    awslogs: {
        // Base64-encoded gzipped UTF8 string of JSON of type CloudWatchLogsEvent
        data: string;
    };
}

// These interfaces are unused, but captured here to document the full type of the payload in case it is needed.
interface LogsEvent {
    messageType: string;
    owner: string;
    logGroup: string;
    logStream: string;
    subscriptionFilters: string[];
    logEvents: LogsLog[];
}

interface LogsLog {
    id: string;
    timestamp: string;
    message: string;
}

// LogCollector is a shared and lazily created Function resource which
// is wired up as a listener on the cloud watch logs for all users functions
// created and managed by the Pulumi framework.
class LogCollector extends pulumi.ComponentResource {
    public readonly lambda: aws.lambda.Function;
    constructor(name: string) {
        super("cloud:logCollector:LogCollector", name);

        const collector = new aws.serverless.Function(
            name,
            { policies: [ aws.iam.AWSLambdaFullAccess ] },
            async (ev: LogsPayload, ctx: aws.serverless.Context, cb: (error: any, result?: {}) => void) => {
                try {
                    const zlib = await import("zlib");
                    const payload = new Buffer(ev.awslogs.data, "base64");
                    const result = zlib.gunzipSync(payload);
                    console.log(result.toString("utf8"));
                    cb(null, {});
                } catch (err) {
                    cb(err);
                }
            },
            this,
        );
        this.lambda = collector.lambda;

        const region = aws.config.requireRegion();
        const permission = new aws.lambda.Permission(name, {
            action: "lambda:invokeFunction",
            function: this.lambda,
            principal: "logs." + region + ".amazonaws.com",
        }, this);
    }
}

let logCollector: LogCollector | undefined;
export function getLogCollector(): aws.lambda.Function {
    if (logCollector === undefined) {
        // Lazily construct the application logCollector lambda; do it in a scope where we don't have a parent,
        // so the logCollector doesn't get falsely attributed to the caller.
        logCollector = new LogCollector(createNameWithStackInfo(`-global`, 56));
    }
    return logCollector.lambda;
}
