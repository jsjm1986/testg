import http.server
import socketserver
import os

PORT = 3000

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/html')
        self.end_headers()
        if self.path == '/':
            with open('index.html', 'rb') as file:
                self.wfile.write(file.read())
        else:
            try:
                with open(self.path.lstrip('/'), 'rb') as file:
                    self.wfile.write(file.read())
            except:
                self.send_error(404)

print(f"Starting server at http://localhost:{PORT}")
print("Current directory:", os.getcwd())
print("Available files:", os.listdir())

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Server running at http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close() 