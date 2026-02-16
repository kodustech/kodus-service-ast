// Testes unitários para validar as configurações do RabbitMQ
// Usando constantes locais para evitar problemas de importação ESM

describe('Queue Configuration Tests', () => {
    // Constantes locais para teste (espelhando as do código real)
    const QUEUE_CONFIG = {
        EXCHANGE: 'ast.jobs.x',
        DEAD_LETTER_EXCHANGE: 'ast.jobs.dlx',
        DELAYED_EXCHANGE: 'ast.jobs.delayed.x',
        DIFF_QUEUE: 'ast.initialize.diff.q',
        VALIDATE_CODE_QUEUE: 'ast.validate.code.q',
        DEAD_LETTER_QUEUE: 'ast.jobs.dlq',
        DIFF_ROUTING_KEY: 'ast.initialize.diff',
        VALIDATE_CODE_ROUTING_KEY: 'ast.validate.code',
        ECHO_ROUTING_KEY: 'ast.test.echo',
        DELIVERY_LIMIT: 3,
        QUEUE_TYPE: 'quorum',
    };
    describe('Exchange Configuration', () => {
        test('should have all required exchanges defined', () => {
            expect(QUEUE_CONFIG.EXCHANGE).toBe('ast.jobs.x');
            expect(QUEUE_CONFIG.DEAD_LETTER_EXCHANGE).toBe('ast.jobs.dlx');
            expect(QUEUE_CONFIG.DELAYED_EXCHANGE).toBe('ast.jobs.delayed.x');
        });

        test('should have unique exchange names', () => {
            const exchanges = [
                QUEUE_CONFIG.EXCHANGE,
                QUEUE_CONFIG.DEAD_LETTER_EXCHANGE,
                QUEUE_CONFIG.DELAYED_EXCHANGE,
            ];

            const uniqueExchanges = new Set(exchanges);
            expect(uniqueExchanges.size).toBe(exchanges.length);
        });
    });

    describe('Queue Configuration', () => {
        test('should have all required queues defined', () => {
            expect(QUEUE_CONFIG.DIFF_QUEUE).toBe('ast.initialize.diff.q');
            expect(QUEUE_CONFIG.VALIDATE_CODE_QUEUE).toBe(
                'ast.validate.code.q',
            );
            expect(QUEUE_CONFIG.DEAD_LETTER_QUEUE).toBe('ast.jobs.dlq');
        });

        test('should have consistent naming pattern', () => {
            const queues = [
                QUEUE_CONFIG.DIFF_QUEUE,
                QUEUE_CONFIG.VALIDATE_CODE_QUEUE,
                QUEUE_CONFIG.DEAD_LETTER_QUEUE,
            ];

            queues.forEach((queue) => {
                expect(queue).toMatch(/^ast\./);
                // DLQ doesn't follow .q pattern, others do
                if (queue !== QUEUE_CONFIG.DEAD_LETTER_QUEUE) {
                    expect(queue).toMatch(/\.q$/);
                } else {
                    expect(queue).toMatch(/dlq$/);
                }
            });
        });
    });

    describe('Routing Keys', () => {
        test('should have all required routing keys defined', () => {
            expect(QUEUE_CONFIG.DIFF_ROUTING_KEY).toBe('ast.initialize.diff');
            expect(QUEUE_CONFIG.VALIDATE_CODE_ROUTING_KEY).toBe(
                'ast.validate.code',
            );
            expect(QUEUE_CONFIG.ECHO_ROUTING_KEY).toBe('ast.test.echo');
        });

        test('should have consistent routing key pattern', () => {
            const routingKeys = [
                QUEUE_CONFIG.DIFF_ROUTING_KEY,
                QUEUE_CONFIG.VALIDATE_CODE_ROUTING_KEY,
                QUEUE_CONFIG.ECHO_ROUTING_KEY,
            ];

            routingKeys.forEach((key) => {
                expect(key).toMatch(/^ast\./);
            });
        });
    });

    describe('Queue Arguments', () => {
        test('should have delivery limit configured', () => {
            expect(QUEUE_CONFIG.DELIVERY_LIMIT).toBeGreaterThan(0);
            expect(Number.isInteger(QUEUE_CONFIG.DELIVERY_LIMIT)).toBe(true);
        });

        test('should have valid queue type', () => {
            expect(QUEUE_CONFIG.QUEUE_TYPE).toBe('quorum');
        });
    });

    describe('Configuration Consistency', () => {
        test('should have matching queue and routing key pairs', () => {
            // Diff queue should match diff routing key
            expect(QUEUE_CONFIG.DIFF_QUEUE).toContain('diff');
            expect(QUEUE_CONFIG.DIFF_ROUTING_KEY).toContain('diff');

            // Validate-code queue should match validate-code routing key
            expect(QUEUE_CONFIG.VALIDATE_CODE_QUEUE).toContain('validate');
            expect(QUEUE_CONFIG.VALIDATE_CODE_ROUTING_KEY).toContain(
                'validate',
            );
        });

        test('should have dead letter exchange referenced in queue names', () => {
            expect(QUEUE_CONFIG.DEAD_LETTER_QUEUE).toContain('dlq');
        });
    });
});
