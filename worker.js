// ============================================================
//  worker.js - 测速专用 Worker（不阻塞主线程）
// ============================================================

let completedCount = 0;
let totalCount = 0;

self.addEventListener('message', function(e) {
    const { urls } = e.data;
    totalCount = urls.length;
    completedCount = 0;
    
    if (totalCount === 0) {
        self.postMessage({ type: 'complete' });
        return;
    }
    
    const CONCURRENCY = 5;
    let index = 0;
    
    function runNext() {
        if (index >= totalCount) return;
        const url = urls[index];
        const currentIndex = index;
        index++;
        testLatency(url, currentIndex).finally(() => {
            runNext();
        });
    }
    
    for (let i = 0; i < Math.min(CONCURRENCY, totalCount); i++) {
        runNext();
    }
});

async function testLatency(url, index) {
    const start = performance.now();
    const timeout = 3000;
    
    if (!url || !url.startsWith('http')) {
        self.postMessage({
            type: 'result',
            index: index,
            url: url,
            latency: '失效'
        });
        checkComplete();
        return;
    }
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        await fetch(url, {
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-cache',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const latency = Math.round(performance.now() - start);
        
        self.postMessage({
            type: 'result',
            index: index,
            url: url,
            latency: latency
        });
        
    } catch (err) {
        self.postMessage({
            type: 'result',
            index: index,
            url: url,
            latency: '超时'
        });
    }
    
    checkComplete();
}

function checkComplete() {
    completedCount++;
    if (completedCount === totalCount) {
        self.postMessage({ type: 'complete' });
    }
}

self.addEventListener('error', function(e) {
    self.postMessage({
        type: 'error',
        message: e.message || 'Worker 发生错误'
    });
});
