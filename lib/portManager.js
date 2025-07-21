const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const PORT_MAP_FILE = '.port-map.json';

class PortManager {
  constructor() {
    this.portMap = {};
    this.portMapPath = null;
  }

  async init(baseDir) {
    this.portMapPath = path.join(baseDir, PORT_MAP_FILE);
    await this.load();
  }

  async load() {
    if (!this.portMapPath) {
      throw new Error('Port manager not initialized');
    }

    try {
      const data = await fs.readFile(this.portMapPath, 'utf8');
      this.portMap = JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.portMap = {};
        await this.save();
      } else {
        throw error;
      }
    }
  }

  async save() {
    if (!this.portMapPath) {
      throw new Error('Port manager not initialized');
    }

    await fs.writeFile(
      this.portMapPath,
      JSON.stringify(this.portMap, null, 2)
    );
  }

  async assignPorts(worktreeName, services, portRanges) {
    const usedPorts = this.getAllUsedPorts();
    const assignments = {};

    for (const service of services) {
      const range = portRanges[service];
      if (!range) {
        throw new Error(`No port range defined for service: ${service}`);
      }

      const port = this.findAvailablePort(range, usedPorts);
      assignments[service] = port;
      usedPorts.push(port);
    }

    this.portMap[worktreeName] = {
      ...assignments,
      created: new Date().toISOString()
    };

    await this.save();
    return assignments;
  }

  findAvailablePort(range, usedPorts) {
    let port = range.start;
    
    while (usedPorts.includes(port)) {
      port += range.increment;
      if (port > 65535) {
        throw new Error('No available ports in range');
      }
    }

    return port;
  }

  getAllUsedPorts() {
    const ports = [];
    
    for (const worktree of Object.values(this.portMap)) {
      for (const [key, value] of Object.entries(worktree)) {
        if (key !== 'created' && typeof value === 'number') {
          ports.push(value);
        }
      }
    }

    return ports;
  }

  async releasePorts(worktreeName) {
    if (this.portMap[worktreeName]) {
      delete this.portMap[worktreeName];
      await this.save();
    }
  }

  getPorts(worktreeName) {
    const worktree = this.portMap[worktreeName];
    if (!worktree) {
      return null;
    }

    const ports = {};
    for (const [key, value] of Object.entries(worktree)) {
      if (key !== 'created') {
        ports[key] = value;
      }
    }

    return ports;
  }

  getAllPorts() {
    const result = {};
    
    for (const [worktreeName] of Object.entries(this.portMap)) {
      result[worktreeName] = this.getPorts(worktreeName);
    }

    return result;
  }

  async isPortInUse(port) {
    try {
      const platform = process.platform;
      let command;
      
      if (platform === 'darwin' || platform === 'linux') {
        command = `lsof -i :${port} -P -n | grep LISTEN`;
      } else if (platform === 'win32') {
        command = `netstat -ano | findstr ":${port} "`;
      } else {
        return false;
      }

      await execAsync(command);
      return true;
    } catch {
      return false;
    }
  }

  async getRunningPorts(worktreeName) {
    const ports = this.getPorts(worktreeName);
    if (!ports) {
      return {};
    }

    const running = {};
    
    for (const [service, port] of Object.entries(ports)) {
      if (await this.isPortInUse(port)) {
        running[service] = port;
      }
    }

    return running;
  }

  formatPortDisplay(ports) {
    if (!ports || Object.keys(ports).length === 0) {
      return 'No ports assigned';
    }

    return Object.entries(ports)
      .map(([service, port]) => `${service}:${port}`)
      .join(' ');
  }
}

module.exports = new PortManager();