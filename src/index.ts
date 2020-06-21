import ConsumerQueue from 'consumer-queue';

type integer = number;

export class RobustWsOptions {
    protocols?: string | string[];
    connectionTimeout?: integer;
    pingData?: string;
    pongData?: string;
    pingTimout?: integer;
    binaryType?: BinaryType;
    maxRetries?: integer;
    retryInterval?: integer;
}

export const defaultRobustWsOptions: RobustWsOptions = {
    connectionTimeout: 5000,
    pingData: "P",
    pongData: "P",
    pingTimout: 20 * 1000,
    maxRetries: 3,
    retryInterval: 1000,
};

export class RobustWsError extends Error {
}

export class RobustWsErrorTimeout extends RobustWsError {
}

export class RobustWsInvalidState extends RobustWsError {
}

export class RobustWsPingTimeout extends RobustWsError {
}

export class RobustWsClosed extends RobustWsError {
    closeEvent: CloseEvent;

    constructor(closeEvent: CloseEvent, message?: string) {
        super(message);
        this.closeEvent = closeEvent;
    }
}

export interface RobustWsSession {
    send: (message: string | ArrayBufferLike | Blob | ArrayBufferView) => void;
    close: (code?: number, reason?: string) => void;
    readyState: () => integer | undefined;
}

class RobustWs<MessageDataType = string> {
    url: string;
    options: RobustWsOptions;
    _ws?: WebSocket;
    _queue?: ConsumerQueue;
    _session?: RobustWsSession;

    constructor(url: string, options?: RobustWsOptions) {
        this.url = url;
        this.options = Object.assign({...defaultRobustWsOptions}, options);
        this._queue = new ConsumerQueue;
    }

    async _open() {
        return new Promise<void>((resolve, reject) => {
            if (this._ws && this._ws?.readyState === WebSocket.OPEN) {
                resolve();
            } else {
                this._ws = new WebSocket(this.url, this.options.protocols);

                if (this.options.binaryType) {
                    this._ws.binaryType = this.options.binaryType;
                }

                setTimeout(() => {
                    if (this._ws?.readyState !== WebSocket.OPEN) {
                        reject(new RobustWsErrorTimeout);
                    }
                }, this.options.connectionTimeout);
                this._ws.onopen = () => {
                    resolve();
                };

            }
        });
    }

    async _recvWorker(): Promise<void> {
        try {
            while (true) {
                const data = await this._recv();
                this._queue.push(data);
            }
        } finally {
            console.log("_recvWorker stopped")
        }
    }

    async _recv(): Promise<MessageDataType> {
        return new Promise<MessageDataType>((resolve, reject) => {
            if (!this._ws) {
                reject(new RobustWsInvalidState("Cannot recv message when WebSocket is not set up. "));
                return;
            }

            if (this._ws.onmessage) {
                reject(new RobustWsInvalidState("Cannot fire recv before one is finished"));
            }

            const cleanUp = () => {
                this._ws!.onclose = null;
                this._ws!.onmessage = null;
                clearInterval(pingInterval);
            };

            this._ws.onmessage = e => {
                if (e.data !== this.options.pingData) {
                    cleanUp();
                    resolve(e.data);
                } else {
                    this._ws?.send(this.options.pongData!);
                }
            };

            this._ws.onclose = e => {
                cleanUp();
                reject(new RobustWsClosed(e));
            };

            const pingInterval = setInterval(() => {
                cleanUp();
                reject(new RobustWsPingTimeout);
            }, this.options.pingTimout);

            if (this._ws?.readyState !== WebSocket.OPEN) {
                cleanUp();
                reject(new RobustWsInvalidState("Cannot recv message when state is not OPEN. "));
                return;
            }
        })
    }

    _send(message: string | ArrayBufferLike | Blob | ArrayBufferView) {
        if (!this._ws) {
            throw new RobustWsInvalidState("Cannot send message when ws is not set up. ");
        }

        if (this._ws.readyState !== WebSocket.OPEN) {
            throw new RobustWsInvalidState("Cannot recv message when state is not OPEN. ");
        }

        this._ws.send(message);
    }

    _close(code?: number, reason?: string) {
        if (this._ws) {
            this._ws.close(code, reason);
        }
    }

    openSession(
        handlers: {
            onMessage?: (data: MessageDataType) => void,
            onConnected?: () => void,
            onClosed?: () => void
        }): RobustWsSession {
        // Opens a reconnecting session.

        if (this._session) {
            return this._session;
        }

        let numberRetries = 0;
        let retrying = true;
        let taskQueue = new ConsumerQueue();

        const session: RobustWsSession = {
            send: (...args) => {
                taskQueue.push(() => this._send(...args));
            },
            close: (...args) => {
                taskQueue.push(() => this._close(...args));
            },
            readyState: () => this._ws?.readyState,
        };

        this._session = session;

        const taskWorker = async () => {
            try {
                while (true) {
                    const task = await taskQueue.pop();
                    task();
                }
            } finally {
                console.log("taskWorker stopped")
            }
        };

        const messageWorker = async () => {
            try {
                while (true) {
                    const message = await this._queue.pop();
                    handlers.onMessage && handlers.onMessage(message);
                }
            } finally {
                console.log("messageWorker stopped");
            }
        };

        const runSession = async () => {
            // TODO: Automatically reconnect on network resumes;
            try {
                while (true) {
                    try {
                        if (retrying) {
                            await this._open();
                            console.log("connected");
                            numberRetries = 0;

                            await Promise.race([
                                this._recvWorker(),   // Receives message and reads to queue
                                taskWorker(),         // Execute tasked from user
                                messageWorker(),      // Call handler on each received message
                            ]);
                        } else {

                        }

                    } catch (e) {
                        console.log(e, e.constructor);

                        if (e instanceof RobustWsError) {
                            if (e instanceof RobustWsClosed) {
                                if (e.closeEvent.wasClean) {
                                    handlers.onClosed && handlers.onClosed();
                                    console.log("stopped cleanly");
                                    return;
                                }
                            }

                            if (numberRetries + 1 >= this.options.maxRetries!) {
                                handlers.onClosed && handlers.onClosed();
                                retrying = false;
                            }

                            await new Promise(resolve => setTimeout(resolve, this.options.retryInterval! * (1 << numberRetries)));
                            if (retrying) {
                                console.log("reconnecting...");
                                numberRetries++;
                            }
                        } else {
                            throw e;
                        }
                    } finally {
                        this._queue.cancelWait();
                        taskQueue.cancelWait();
                    }
                }
            } finally {
                this._session = undefined;
            }
        };

        runSession();
        return session;
    }
}

export default RobustWs;