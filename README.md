# FGS-PRO 3000: Industrial Fire & Gas Monitoring Safety Dashboard

FGS-PRO 3000 is a premium, web-based industrial monitoring dashboard designed to interface with PLC systems via Modbus TCP/IP, routed through Node-RED, and transmitted over an MQTT Cloud Broker. It integrates real-time telemetry, interactive spatial floor plan graphics, historical trend charts, event logging, and synthesized alarm sirens.

---

## 🏗️ System Architecture

```
┌─────────────────┐       Modbus TCP/IP       ┌──────────────┐
│  PLC/Sensors    │ ────────────────────────> │   Node-RED   │
│ (Field Devices) │                           │ (Edge Agent) │
└─────────────────┘                           └──────────────┘
                                                     │
                                                     │ MQTT over TCP
                                                     ▼
┌─────────────────┐       MQTT WebSockets     ┌──────────────┐
│  Web Dashboard  │ <──────────────────────── │ MQTT Broker  │
│ (Operator View) │                           │   (Cloud)    │
└─────────────────┘                           └──────────────┘
```

1. **Physical/Field Layer**: Sensors (Smoke, Heat, Gas, Manual Call Points) and actuators (Alarm bells, HVAC dampers, Deluge sprinklers) are connected to a PLC.
2. **Gateway Layer**: Node-RED polls the PLC registers via Modbus TCP/IP, compiles the data into structured JSON, and publishes it to the cloud MQTT broker.
3. **Cloud Broker**: A secure MQTT broker (e.g., HiveMQ, EMQX, AWS IoT) handles data distribution.
4. **Dashboard Layer**: The HTML5/JS monitoring client connects to the MQTT broker using WebSockets (`wss://`) to display the live plant safety status and publish operator overrides.

---

## 📋 PLC Modbus Register Mapping

To integrate this dashboard with your PLC, configure your Modbus register assignments to match the following mapping polled by the Node-RED flow:

### 1. Analog Inputs (Holding Registers)
These registers represent analog telemetry. Note the scaling factors applied in Node-RED to translate raw integers into engineering values:

| Modbus Address | Register Type | Tag / Variable Name | Data Type | Range / Limit | Scaling Factor | Engineering Units |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **40001** | Holding Register | `z1_smoke` | 16-bit Int | `0` to `500` | `/100` | `0.00` to `5.00` % obs/m |
| **40002** | Holding Register | `z1_temp` | 16-bit Int | `0` to `1200` | `/10` | `0.0` to `120.0` °C |
| **40003** | Holding Register | `z2_smoke` | 16-bit Int | `0` to `500` | `/100` | `0.00` to `5.00` % obs/m |
| **40004** | Holding Register | `z2_temp` | 16-bit Int | `0` to `1200` | `/10` | `0.0` to `120.0` °C |
| **40005** | Holding Register | `z3_smoke` | 16-bit Int | `0` to `500` | `/100` | `0.00` to `5.00` % obs/m |
| **40006** | Holding Register | `z3_temp` | 16-bit Int | `0` to `1200` | `/10` | `0.0` to `120.0` °C |
| **40007** | Holding Register | `z3_gas` | 16-bit Int | `0` to `1000` | `1:1` (None) | `0` to `1000` ppm (CO/CH4) |

### 2. Digital Inputs (Input Status / Contacts)
These represent digital field devices (switches, buttons):

| Modbus Address | Register Type | Tag / Variable Name | Data Type | normal | Triggered / Active | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **10001** | Input Status | `z1_mcp` | Boolean | `False` (0) | `True` (1) | Zone 1 Manual Call Point pulled |
| **10002** | Input Status | `z2_mcp` | Boolean | `False` (0) | `True` (1) | Zone 2 Manual Call Point pulled |
| **10003** | Input Status | `z3_mcp` | Boolean | `False` (0) | `True` (1) | Zone 3 Manual Call Point pulled |

### 3. Actuator Outputs (Coils)
These represent coils driven by the PLC safety logic and command responses:

| Modbus Address | Register Type | Tag / Variable Name | Data Type | Default | Alarm State | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **00001** | Coil | `z1_bell` | Boolean | `False` (0) | `True` (1) | Zone 1 Alarm Bell Strikers Active |
| **00002** | Coil | `z2_bell` | Boolean | `False` (0) | `True` (1) | Zone 2 Alarm Bell Strikers Active |
| **00003** | Coil | `z3_bell` | Boolean | `False` (0) | `True` (1) | Zone 3 Alarm Bell Strikers Active |
| **00010** | Coil | `hmi_ack` | Boolean | `False` (0) | Pulse `True` | Acknowledge alarm trigger from dashboard |
| **00011** | Coil | `hmi_reset` | Boolean | `False` (0) | Pulse `True` | System reset trigger from dashboard |

---

## 🚀 Step-by-Step Integration Guide

### Step 1: Configure Your Modbus Server (PLC)
If testing without physical hardware, run a Modbus simulator on your local machine:
- Recommended: **ModbusPal** or **Mod_RSsim**.
- Set up a TCP Server listening on port `502`.
- Populate values in Holding Registers `40001` - `40007` to simulate normal environmental levels (e.g. `220` for temperature to represent `22.0°C`).

### Step 2: Setup Node-RED Gateway
1. Open your Node-RED instance (typically at `http://localhost:1880`).
2. Install the Modbus plugin via **Menu -> Manage Palette -> Install**: Search and install `node-red-contrib-modbus`.
3. Click **Menu -> Import**, and copy the contents of [node_red_flow.json](file:///d:/Fire%20and%20Gas%20monitoring/node_red_flow.json) into the import text area. Click **Import**.
4. Double-click the **PLC_Modbus_TCP** client node and update the IP address/Port to match your PLC server (default: `127.0.0.1:502`).
5. Double-click the **EMQX Public Broker** MQTT config node and change the broker domain if you are using a private broker (default: `broker.emqx.io`).
6. Click **Deploy** in the top right corner. Ensure the Modbus nodes show "connected" or "active".

### Step 3: Run the Web Dashboard
1. Simply double-click [index.html](file:///d:/Fire%20and%20Gas%20monitoring/index.html) to open it in any web browser.
2. The dashboard runs in **Simulation Mode** by default. Toggle sliders to verify siren sounds (mute/unmute in header), visual layouts, and chart plotting.
3. Click **Live MQTT Mode** on the left control panel.
4. Provide your MQTT WebSocket credentials:
   - **Host URL**: Specify broker secure WebSockets address (e.g. `wss://broker.emqx.io:8084/mqtt` or your private server WSS address).
   - Click **Connect MQTT**.
5. Once connected, the dashboard will display live states published by Node-RED from the PLC Modbus registers.

---

## ⚡ Dashboard Operations

- **Operator Sound Mute**: Click the volume speaker icon in the top header. This disables the Web Audio API synthesizer.
- **Acknowledge Alarm**: Silences the alarm siren sound and hides flashing screen overlays.
- **System Reset**: Resets the latched alarm circuits. *Note: If a physical sensor continues to report temperatures above 57°C or smoke levels above 1.5% obs/m, the alarm will immediately re-trip to maintain failsafe operations.*
- **Export Event Log**: Click the **Export CSV** button in the safety log section to download a complete, filterable audit report of all alarms, warnings, resets, and connections.

---

## 🖥️ VDI (Virtual Desktop Infrastructure) Migration Guidelines

This system is fully compatible with VDI platforms (e.g., VMware Horizon, Citrix Virtual Apps/Desktops, Microsoft Azure Virtual Desktop). Review the following recommendations for virtualized hosting:

### 1. Networking & Firewall Routing
* **Node-RED VM**: Host Node-RED on a persistent Virtual Machine (Windows/Linux) or Docker container inside the secure OT (Operations Technology) network. This VM must have IP routing access to the PLC network on Port `502` (Modbus TCP).
* **MQTT WebSocket Ports**: The VDI clients (browsers) connect to the MQTT broker over HTTP WebSockets. Ensure firewalls allow outbound traffic from VDI client pools to the MQTT broker on:
  * Port `8083` (for unsecure `ws://` connections)
  * Port `8084` or `443` (for secure `wss://` connections)

### 2. Audio Redirection (Alarms & Sirens)
* Because the dashboard synthesizes alarms using the browser's Web Audio API, ensure **VDI Audio Redirection** is enabled in your VDI agent configuration (e.g., VMware Horizon RTAV or Citrix HDX Audio). This allows the operator to hear sirens locally from their remote client terminal.

### 3. High Availability (HA)
* Since the dashboard is a thin client (static HTML/JS/CSS), it can be hosted on a highly available, load-balanced web server (like Nginx, Apache, or IIS) inside the corporate datacenter. This ensures operators can access the dashboard from any thin-client VDI station.

---

## 🐳 Docker Deployment Guide (Linux)

You can run the entire FGS-PRO 3000 monitoring stack (MQTT Broker, Node-RED gateway, and Web Dashboard) locally inside Docker on your Linux host.

### Quick Start
1. Make sure `docker` and `docker-compose` are installed and running on your Linux host.
2. Place all the files in a folder on your Linux machine and build/launch the stack:
   ```bash
   docker-compose up --build -d
   ```
3. Access the services:
   * **Safety Dashboard**: Open `http://<your-linux-ip>:8080` in any web browser.
   * **Node-RED Admin Panel**: Open `http://<your-linux-ip>:1880` to configure Modbus connection.
   * **MQTT WebSockets Broker**: Connect to `ws://<your-linux-ip>:9001/mqtt`.

### Container Services:
* **`fgs_mqtt_broker`** (Mosquitto): Configured to open standard port `1883` (for Node-RED) and WebSockets port `9001` (for browser client dashboard).
* **`fgs_nodered_gateway`** (Node-RED): Custom built to install `node-red-contrib-modbus` and auto-loads your Modbus flow `node_red_flow.json`.
* **`fgs_dashboard`** (Nginx alpine): Serves the dashboard files on port `8080`.
