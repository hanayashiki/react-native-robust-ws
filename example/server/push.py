import websockets

import asyncio
import websockets


async def hello(websocket, path):

    async def ping():
        while True:
            await asyncio.sleep(10)
            await websocket.send("P")

    async def serve():
        while True:
            await websocket.send("fuck you")
            await asyncio.sleep(1)

    await asyncio.gather(ping(), serve())

start_server = websockets.serve(hello, "localhost", 8765)

asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()