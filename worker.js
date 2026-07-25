// ============================================================
//  worker.js - 测速专用 Worker（不阻塞主线程）
// ============================================================

let completedCount = 0;
let totalCount = 0;

// 监听主线程消息
self.addEventListener('message', function(e) {
    const { urls } = e.data;
    totalCount = urls.length;
    completedCount = 0;
    
    if (totalCount === 0) {
        self.postMessage({ type: 'complete' });
        return;
    }
    
    // 并发测速，限制并发数为 5
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
    
    // 启动并发任务
    for (let i = 0; i < Math.min(CONCURRENCY, totalCount); i++) {
        runNext();
    }
});

// ============================================================
//  测速函数
// ============================================================

async function testLatency(url, index) {
    const start = performance.now();
    const timeout = 3000;
    
    // 检查 URL 是否有效
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
        
        const response = await fetch(url, {
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-cache',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const latency = Math.round(performance.now() - start);
        
        // no-cors 模式下无法读取状态，只要不报错就认为成功
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

// ============================================================
//  检查是否全部完成
// ============================================================

function checkComplete() {
    completedCount++;
    if (completedCount === totalCount) {
        self.postMessage({ type: 'complete' });
    }
}

// ============================================================
//  错误处理：Worker 异常时通知主线程
// ============================================================

self.addEventListener('error', function(e) {
    self.postMessage({
        type: 'error',
        message: e.message || 'Worker 发生错误'
    });
});
