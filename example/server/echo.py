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
            name = await websocket.recv()
            print(f"< {name}")

            greeting = f"Hello {name}!"

            await websocket.send(greeting)
            print(f"> {greeting}")

    await asyncio.gather(ping(), serve())

start_server = websockets.serve(hello, "localhost", 8765)

asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()