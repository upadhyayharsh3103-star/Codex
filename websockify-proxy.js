const WebSocket = require('ws');
const net = require('net');

const WS_PORT = 6080;
const VNC_HOST = 'localhost';
const VNC_PORT = 5900;

const wss = new WebSocket.Server({ port: WS_PORT });

console.log(`WebSocket server listening on port ${WS_PORT}`);
console.log(`Proxying to VNC server at ${VNC_HOST}:${VNC_PORT}`);

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  const vncSocket = net.createConnection({
    host: VNC_HOST,
    port: VNC_PORT
  });

  vncSocket.on('connect', () => {
    console.log('Connected to VNC server');
  });

  vncSocket.on('data', (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data, { binary: true });
    }
  });

  ws.on('message', (message) => {
    vncSocket.write(message);
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    vncSocket.end();
  });

  vncSocket.on('close', () => {
    console.log('VNC connection closed');
    ws.close();
  });

  vncSocket.on('error', (err) => {
    console.error('VNC socket error:', err.message);
    ws.close();
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    vncSocket.end();
  });
});

wss.on('error', (err) => {
  console.error('WebSocket server error:', err);
});
