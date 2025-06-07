import { describe, expect, test, beforeEach } from '@jest/globals';

describe('Memory Usage Performance Tests', () => {
  const MEMORY_THRESHOLD_MB = 100; // 100MB max memory usage

  beforeEach(() => {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  test('should not exceed memory threshold during large data processing', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Simulate processing large amount of data
    const largeArray = Array.from({ length: 10000 }, (_, i) => ({
      id: i,
      data: `Large data string ${i}`.repeat(100),
      timestamp: new Date().toISOString(),
      metadata: {
        index: i,
        type: 'test',
        nested: {
          value: i * 2,
          description: `Nested data for ${i}`
        }
      }
    }));

    // Process the data
    const processedData = largeArray
      .filter(item => item.id % 2 === 0)
      .map(item => ({
        ...item,
        processed: true,
        processedAt: new Date().toISOString()
      }))
      .slice(0, 1000);

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryUsedMB = (finalMemory - initialMemory) / 1024 / 1024;

    expect(processedData.length).toBeGreaterThan(0);
    expect(memoryUsedMB).toBeLessThan(MEMORY_THRESHOLD_MB);
  });

  test('should handle concurrent operations without memory leaks', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Create multiple concurrent operations
    const promises = Array.from({ length: 10 }, async (_, i) => {
      const data = Array.from({ length: 1000 }, (_, j) => ({
        id: `${i}-${j}`,
        value: Math.random(),
        timestamp: Date.now()
      }));

      return data.reduce((acc, item) => acc + item.value, 0);
    });

    await Promise.all(promises);

    // Allow some time for cleanup
    await new Promise(resolve => setTimeout(resolve, 100));

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryUsedMB = (finalMemory - initialMemory) / 1024 / 1024;

    expect(memoryUsedMB).toBeLessThan(MEMORY_THRESHOLD_MB);
  });

  test('should release memory after processing', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Create and process data in a scope that can be garbage collected
    await (async () => {
      const tempData = Array.from({ length: 5000 }, (_, i) => ({
        id: i,
        data: `Temporary data ${i}`.repeat(50)
      }));

      // Process the data
      return tempData.map(item => item.id).reduce((a, b) => a + b, 0);
    })();

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Allow time for garbage collection
    await new Promise(resolve => setTimeout(resolve, 100));

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryDifferenceMB = Math.abs(finalMemory - initialMemory) / 1024 / 1024;

    // Memory usage should be relatively stable
    expect(memoryDifferenceMB).toBeLessThan(MEMORY_THRESHOLD_MB / 2);
  });
});