import socket

def scan():
    print("Broadcasting Magic Home discovery message on port 48899...")
    msg = b"HF-A11ASSISTHREAD"
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.settimeout(5)
    
    # Send broadcast
    try:
        sock.sendto(msg, ("255.255.255.255", 48899))
    except Exception as e:
        print(f"Error sending broadcast: {e}")
        return

    print("Waiting for replies. If this takes longer than 5 seconds and returns nothing, the lights might not be connected to your Wi-Fi...")
    
    found = False
    while True:
        try:
            data, addr = sock.recvfrom(1024)
            ip = addr[0]
            info = data.decode("utf-8", "ignore").strip()
            print(f"\n[+] SUCCESS! Found Device:")
            print(f"    IP Address: {ip}")
            print(f"    Raw Info:   {info}")
            found = True
        except socket.timeout:
            break
            
    if not found:
        print("\n[-] No devices found. Please double check that the lights are connected to the same Wi-Fi network as this PC.")

if __name__ == "__main__":
    scan()
