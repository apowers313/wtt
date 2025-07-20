const portManager = require('../../lib/portManager');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('PortManager (integration)', () => {
  let tempDir;
  let baseDir;
  
  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portmanager-test-'));
    baseDir = path.join(tempDir, '.worktrees');
    await fs.mkdir(baseDir, { recursive: true });
    
    // Reset portManager state
    portManager.portMap = {};
    portManager.portMapPath = null;
    
    await portManager.init(baseDir);
  });
  
  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('init and load', () => {
    test('initializes with base directory and creates empty port map', async () => {
      expect(portManager.portMapPath).toBe(path.join(baseDir, '.port-map.json'));
      expect(portManager.portMap).toEqual({});
      
      // Verify file was created
      const fileContent = await fs.readFile(portManager.portMapPath, 'utf8');
      expect(JSON.parse(fileContent)).toEqual({});
    });

    test('loads existing port map', async () => {
      const existingPortMap = {
        'wt-feature': { vite: 3010, storybook: 6016, created: '2024-01-01' }
      };
      
      // Create port map file
      await fs.writeFile(
        path.join(baseDir, '.port-map.json'),
        JSON.stringify(existingPortMap)
      );
      
      // Reinitialize
      portManager.portMap = {};
      portManager.portMapPath = null;
      await portManager.init(baseDir);
      
      expect(portManager.portMap).toEqual(existingPortMap);
    });
  });

  describe('assignPorts', () => {
    test('assigns ports from configured ranges', async () => {
      const services = ['vite', 'storybook'];
      const portRanges = {
        vite: { start: 3000, increment: 10 },
        storybook: { start: 6006, increment: 10 }
      };
      
      const ports = await portManager.assignPorts('wt-feature', services, portRanges);
      
      expect(ports).toEqual({
        vite: 3000,
        storybook: 6006
      });
      
      // Verify saved to file
      const fileContent = await fs.readFile(portManager.portMapPath, 'utf8');
      const savedMap = JSON.parse(fileContent);
      expect(savedMap['wt-feature']).toMatchObject({
        vite: 3000,
        storybook: 6006,
        created: expect.any(String)
      });
    });

    test('skips already assigned ports', async () => {
      // First assignment
      await portManager.assignPorts('wt-existing', ['vite', 'storybook'], {
        vite: { start: 3000, increment: 10 },
        storybook: { start: 6006, increment: 10 }
      });
      
      // Second assignment should get next available ports
      const ports = await portManager.assignPorts('wt-feature', ['vite', 'storybook'], {
        vite: { start: 3000, increment: 10 },
        storybook: { start: 6006, increment: 10 }
      });
      
      expect(ports).toEqual({
        vite: 3010,
        storybook: 6016
      });
    });

    test('throws when no port range defined for service', async () => {
      const services = ['vite', 'unknown'];
      const portRanges = {
        vite: { start: 3000, increment: 10 }
      };
      
      await expect(portManager.assignPorts('wt-feature', services, portRanges))
        .rejects.toThrow('No port range defined for service: unknown');
    });
  });

  describe('findAvailablePort', () => {
    test('returns first port when none are used', () => {
      const range = { start: 3000, increment: 10 };
      const usedPorts = [];
      
      const port = portManager.findAvailablePort(range, usedPorts);
      
      expect(port).toBe(3000);
    });
    
    test('skips used ports', () => {
      const range = { start: 3000, increment: 10 };
      const usedPorts = [3000, 3010];
      
      const port = portManager.findAvailablePort(range, usedPorts);
      
      expect(port).toBe(3020);
    });
    
    test('throws when no ports available in reasonable range', () => {
      const range = { start: 65530, increment: 10 };
      const usedPorts = Array.from({ length: 10 }, (_, i) => 65530 + i * 10);
      
      expect(() => {
        portManager.findAvailablePort(range, usedPorts);
      }).toThrow('No available ports in range');
    });
  });

  describe('releasePorts', () => {
    test('removes worktree from port map', async () => {
      // Assign ports first
      await portManager.assignPorts('wt-feature', ['vite'], {
        vite: { start: 3000, increment: 10 }
      });
      await portManager.assignPorts('wt-other', ['vite'], {
        vite: { start: 3000, increment: 10 }
      });
      
      await portManager.releasePorts('wt-feature');
      
      expect(portManager.portMap).toEqual({
        'wt-other': expect.objectContaining({ vite: 3010 })
      });
      
      // Verify saved to file
      const fileContent = await fs.readFile(portManager.portMapPath, 'utf8');
      const savedMap = JSON.parse(fileContent);
      expect(savedMap['wt-feature']).toBeUndefined();
      expect(savedMap['wt-other']).toBeDefined();
    });
  });

  describe('getPorts', () => {
    test('returns ports for specific worktree', async () => {
      await portManager.assignPorts('wt-feature', ['vite', 'storybook'], {
        vite: { start: 3000, increment: 10 },
        storybook: { start: 6006, increment: 10 }
      });
      
      const ports = portManager.getPorts('wt-feature');
      
      expect(ports).toEqual({ vite: 3000, storybook: 6006 });
    });

    test('returns null for non-existent worktree', () => {
      const ports = portManager.getPorts('wt-nonexistent');
      
      expect(ports).toBeNull();
    });
  });

  describe('getAllPorts', () => {
    test('returns all port assignments', async () => {
      await portManager.assignPorts('wt-feature1', ['vite'], {
        vite: { start: 3000, increment: 10 }
      });
      await portManager.assignPorts('wt-feature2', ['vite'], {
        vite: { start: 3000, increment: 10 }
      });
      
      const allPorts = portManager.getAllPorts();
      
      expect(allPorts).toEqual({
        'wt-feature1': { vite: 3000 },
        'wt-feature2': { vite: 3010 }
      });
    });

    test('returns empty object when no ports assigned', () => {
      const allPorts = portManager.getAllPorts();
      
      expect(allPorts).toEqual({});
    });
  });

  describe('getAllUsedPorts', () => {
    test('returns array of all used ports', async () => {
      await portManager.assignPorts('wt-feature1', ['vite', 'storybook'], {
        vite: { start: 3000, increment: 10 },
        storybook: { start: 6006, increment: 10 }
      });
      await portManager.assignPorts('wt-feature2', ['vite', 'storybook'], {
        vite: { start: 3000, increment: 10 },
        storybook: { start: 6006, increment: 10 }
      });
      
      const usedPorts = portManager.getAllUsedPorts();
      
      expect(usedPorts.sort()).toEqual([3000, 3010, 6006, 6016]);
    });

    test('returns empty array when no ports assigned', () => {
      const usedPorts = portManager.getAllUsedPorts();
      
      expect(usedPorts).toEqual([]);
    });
  });

  describe('formatPortDisplay', () => {
    test('formats port display correctly', () => {
      const ports = { vite: 3000, storybook: 6006 };
      
      const display = portManager.formatPortDisplay(ports);
      
      expect(display).toBe('vite:3000 storybook:6006');
    });

    test('returns message when no ports', () => {
      const display = portManager.formatPortDisplay(null);
      
      expect(display).toBe('No ports assigned');
    });
  });
});