package com.infinitecanvas.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/** Agent Run 服务端执行器线程池（有界，run 循环与任务执行共用）。 */
@Configuration
public class AgentRunExecutorConfig {

    @Bean(destroyMethod = "shutdownNow")
    public ExecutorService agentRunExecutorService() {
        AtomicInteger sequence = new AtomicInteger();
        return new ThreadPoolExecutor(2, 8, 60, TimeUnit.SECONDS, new LinkedBlockingQueue<>(64), runnable -> {
            Thread thread = new Thread(runnable, "agent-run-" + sequence.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        });
    }
}
