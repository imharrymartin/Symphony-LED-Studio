import socket
import sys

def get_ip():
    msg = b"HF-A11ASSISTHREAD"
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.settimeout(5)
    
    try:
        sock.sendto(msg, ("255.255.255.255", 48899))
    except Exception as e:
        sys.exit(1)

    while True:
        try:
            data, addr = sock.recvfrom(1024)
            with open("ip.txt", "w", encoding="utf-8") as f:
                f.write(addr[0])
            break
        except socket.timeout:
            break

if __name__ == "__main__":
    get_ip()
