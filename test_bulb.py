import asyncio
from flux_led.aio import AIOWifiLedBulb

async def test():
    ip = "192.168.1.247"
    print(f"Testing direct AIO connection to {ip}...")
    try:
        bulb = AIOWifiLedBulb(ip)
        await bulb.async_setup(timeout=5)
        print("AIO Setup Success!")
        print("Sending RED...")
        await bulb.async_set_levels(r=255, g=0, b=0)
        await asyncio.sleep(1)
        print("Sending GREEN...")
        await bulb.async_set_levels(r=0, g=255, b=0)
        await asyncio.sleep(1)
        print("Done.")
    except Exception as e:
        print(f"AIO Failed: {e}")
        print("Trying Legacy Sync Driver...")
        try:
            import flux_led
            sb = flux_led.WifiLedBulb(ip)
            print("Sync Connection Success!")
            print("Sending BLUE...")
            sb.set_levels(0, 0, 255)
            print("Done.")
        except Exception as e2:
            print(f"Sync Failed: {e2}")

if __name__ == "__main__":
    asyncio.run(test())
