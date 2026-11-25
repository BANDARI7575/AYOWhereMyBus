"""Forward staging HTTPS from one macOS Wi-Fi IPv4 subnet to Docker loopback."""
import argparse
import ipaddress
import selectors
import socket
import socketserver
import threading

UPSTREAM = ('127.0.0.1', 18444)
PORT = 8444
RFC1918 = tuple(map(ipaddress.IPv4Network, ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')))


class HTTPSForwarder(socketserver.BaseRequestHandler):
    def handle(self):
        try:
            with socket.create_connection(UPSTREAM, timeout=3) as upstream:
                self.request.settimeout(10)
                upstream.settimeout(10)
                with selectors.DefaultSelector() as ready:
                    ready.register(self.request, selectors.EVENT_READ, upstream)
                    ready.register(upstream, selectors.EVENT_READ, self.request)
                    while events := ready.select(timeout=60):
                        for event, _ in events:
                            data = event.fileobj.recv(64 * 1024)
                            if not data:
                                ready.unregister(event.fileobj)
                                event.data.shutdown(socket.SHUT_WR)
                                if not ready.get_map():
                                    return
                            else:
                                event.data.sendall(data)
        except OSError:
            pass


class WiFiRelay(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, address, gateway, interface):
        self.network = address.network
        self.gateway = gateway
        self.interface = interface
        self.slots = threading.BoundedSemaphore(32)
        super().__init__((str(address.ip), PORT), HTTPSForwarder)

    def server_bind(self):
        # Darwin IP_BOUND_IF confines this IPv4 socket to the selected Wi-Fi interface.
        self.socket.setsockopt(socket.IPPROTO_IP, getattr(socket, 'IP_BOUND_IF', 25),
                               socket.if_nametoindex(self.interface))
        super().server_bind()

    def verify_request(self, request, client_address):
        client = ipaddress.IPv4Address(client_address[0])
        return client in self.network and client not in {
            self.gateway, self.network.network_address, self.network.broadcast_address,
        }

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('address', type=ipaddress.IPv4Interface)
    parser.add_argument('gateway', type=ipaddress.IPv4Address)
    parser.add_argument('interface')
    args = parser.parse_args()
    if not any(args.address.network.subnet_of(private) for private in RFC1918):
        parser.error('An RFC 1918 Wi-Fi subnet is required.')
    if args.gateway not in args.address.network or args.gateway == args.address.ip:
        parser.error('The gateway must be separate from the Mac and on the same Wi-Fi subnet.')
    with WiFiRelay(args.address, args.gateway, args.interface) as relay:
        relay.serve_forever()


if __name__ == '__main__':
    main()
