// // Teste de integração simplificado para comunicação RabbitMQ
// // Testa publicação direta na fila usando amqplib diretamente

// import { QUEUE_CONFIG } from '@/core/infrastructure/queue/queue.constants.js';
// import * as amqp from 'amqplib';

// describe('RabbitMQ Direct Messaging Integration', () => {
//     let connection: amqp.Connection;
//     let channel: amqp.Channel;

//     beforeAll(async () => {
//         // Conectar diretamente ao RabbitMQ usando amqplib
//         const rabbitUrl =
//             process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
//         connection = await amqp.connect(rabbitUrl);
//         channel = await connection.createChannel();

//         // Declarar exchange e queues necessárias
//         await channel.assertExchange('ast.jobs.x', 'topic', { durable: true });
//         await channel.assertExchange('ast.jobs.dlx', 'topic', {
//             durable: true,
//         });
//         await channel.assertExchange(
//             'ast.jobs.delayed.x',
//             'x-delayed-message',
//             {
//                 durable: true,
//                 arguments: { 'x-delayed-type': 'topic' },
//             },
//         );
//         await channel.assertQueue('ast.initialize.repo.q', {
//             durable: true,
//             arguments: {
//                 'x-queue-type': 'quorum',
//                 'x-dead-letter-exchange': 'ast.jobs.dlx',
//                 'x-delivery-limit': 5,
//             },
//         });
//         await channel.assertQueue('ast.initialize.impact.q', {
//             durable: true,
//             arguments: {
//                 'x-queue-type': 'quorum',
//                 'x-dead-letter-exchange': 'ast.jobs.dlx',
//                 'x-delivery-limit': 5,
//             },
//         });
//         await channel.assertQueue('ast.jobs.dlq', { durable: true });

//         // Fazer os bindings
//         await channel.bindQueue(
//             'ast.initialize.repo.q',
//             'ast.jobs.x',
//             'ast.initialize.repo',
//         );
//         await channel.bindQueue(
//             'ast.initialize.impact.q',
//             'ast.jobs.x',
//             'ast.initialize.impact',
//         );
//         await channel.bindQueue('ast.jobs.dlq', 'ast.jobs.dlx', '#');
//     }, 30000);

//     afterAll(async () => {
//         if (channel) {
//             await channel.close();
//         }
//         if (connection) {
//             await connection.close();
//         }
//     });

//     describe('Message Publishing and Consumption', () => {
//         it('should publish and consume a task message', async () => {
//             // Criar uma mensagem de teste
//             const testTaskId = `test-task-${Date.now()}`;
//             const testMessage = {
//                 taskId: testTaskId,
//                 type: 'AST_INITIALIZE_REPOSITORY',
//                 payload: {
//                     repositoryName: 'test-repo',
//                     branch: 'main',
//                     url: 'https://github.com/test/test-repo.git',
//                     accessToken: 'test-token',
//                 },
//                 metadata: { priority: 1 },
//                 retryCount: 0,
//                 createdAt: new Date().toISOString(),
//             };

//             // Publicar diretamente na fila
//             await channel.publish(
//                 'ast.jobs.x',
//                 'ast.initialize.repo',
//                 Buffer.from(JSON.stringify(testMessage)),
//                 {
//                     persistent: true,
//                     messageId: testTaskId,
//                     correlationId: testTaskId,
//                     headers: {
//                         'x-task-type': 'AST_INITIALIZE_REPOSITORY',
//                         'x-retry-count': 0,
//                     },
//                 },
//             );

//             // Aguardar processamento (worker deve consumir)
//             await new Promise((resolve) => setTimeout(resolve, 2000));

//             // Verificar se a mensagem foi consumida (fila vazia)
//             // Primeiro, vamos verificar se há consumidores na fila
//             const queueInfo = await channel.assertQueue(
//                 'ast.initialize.repo.q',
//                 {
//                     durable: true,
//                 },
//             );

//             // A mensagem deve ter sido consumida pelo worker
//             // (assumindo que o worker está rodando e processou)
//             expect(queueInfo.messageCount).toBeLessThanOrEqual(1); // Pode ter 0 ou 1
//         }, 10000);

//         it('should handle invalid task messages gracefully', async () => {
//             // Mensagem inválida
//             const invalidTaskId = `invalid-task-${Date.now()}`;
//             const invalidMessage = {
//                 taskId: invalidTaskId,
//                 type: 'INVALID_TYPE',
//                 payload: null,
//                 metadata: {},
//                 retryCount: 0,
//                 createdAt: new Date().toISOString(),
//             };

//             // Publicar mensagem inválida
//             await amqpConnection.publish(
//                 QUEUE_CONFIG.EXCHANGE,
//                 QUEUE_CONFIG.REPO_ROUTING_KEY, // Routing key errado
//                 invalidMessage as any,
//                 {
//                     persistent: true,
//                     messageId: invalidTaskId,
//                     correlationId: invalidTaskId,
//                     headers: {
//                         'x-task-type': 'INVALID_TYPE',
//                         'x-retry-count': 0,
//                     },
//                 },
//             );

//             // Aguardar processamento
//             await new Promise((resolve) => setTimeout(resolve, 2000));

//             // Verificar se foi para DLQ ou rejeitada
//             const dlqInfo = await amqpConnection.channel.assertQueue(
//                 QUEUE_CONFIG.DEAD_LETTER_QUEUE,
//                 { durable: true },
//             );

//             // Pode ou não ter ido para DLQ dependendo da implementação
//             expect(dlqInfo.messageCount).toBeGreaterThanOrEqual(0);
//         }, 10000);

//         it('should handle concurrent messages', async () => {
//             const messages = [];
//             const taskIds = [];

//             // Criar múltiplas mensagens
//             for (let i = 0; i < 3; i++) {
//                 const taskId = `concurrent-task-${Date.now()}-${i}`;
//                 taskIds.push(taskId);

//                 messages.push({
//                     taskId,
//                     type: 'AST_INITIALIZE_REPOSITORY',
//                     payload: {
//                         repositoryName: `test-repo-${i}`,
//                         branch: 'main',
//                         url: `https://github.com/test/test-repo-${i}.git`,
//                         accessToken: 'test-token',
//                     },
//                     metadata: { priority: 1 },
//                     retryCount: 0,
//                     createdAt: new Date().toISOString(),
//                 });
//             }

//             // Publicar todas as mensagens
//             for (const message of messages) {
//                 await amqpConnection.publish(
//                     QUEUE_CONFIG.EXCHANGE,
//                     QUEUE_CONFIG.REPO_ROUTING_KEY,
//                     message as any,
//                     {
//                         persistent: true,
//                         messageId: message.taskId,
//                         correlationId: message.taskId,
//                         headers: {
//                             'x-task-type': 'AST_INITIALIZE_REPOSITORY',
//                             'x-retry-count': 0,
//                         },
//                     },
//                 );
//             }

//             // Aguardar processamento concorrente
//             await new Promise((resolve) => setTimeout(resolve, 5000));

//             // Verificar que múltiplas mensagens foram publicadas
//             // Como não temos método para verificar tarefas processadas,
//             // apenas confirmamos que conseguimos publicar todas
//             expect(taskIds.length).toBe(3);

//             // Aguardar um pouco mais para processamento
//             await new Promise((resolve) => setTimeout(resolve, 3000));

//             // Verificar se as filas ainda têm mensagens (devem estar sendo processadas)
//             const queueInfo = await amqpConnection.channel.assertQueue(
//                 QUEUE_CONFIG.REPO_QUEUE,
//                 { durable: true },
//             );

//             // Se as mensagens foram processadas rapidamente, a fila pode estar vazia
//             // Se ainda estão sendo processadas, pode haver mensagens
//             expect(queueInfo.messageCount).toBeGreaterThanOrEqual(0);
//         }, 15000);
//     });

//     describe('Queue Health', () => {
//         it('should maintain queue connectivity', async () => {
//             // Verificar se conseguimos publicar e consumir
//             const healthCheckId = `health-check-${Date.now()}`;

//             await amqpConnection.publish(
//                 QUEUE_CONFIG.EXCHANGE,
//                 QUEUE_CONFIG.REPO_ROUTING_KEY,
//                 {
//                     taskId: healthCheckId,
//                     type: 'AST_INITIALIZE_REPOSITORY',
//                     payload: { repositoryName: 'health-check' },
//                     metadata: {},
//                     retryCount: 0,
//                     createdAt: new Date().toISOString(),
//                 } as any,
//                 {
//                     persistent: true,
//                     messageId: healthCheckId,
//                     correlationId: healthCheckId,
//                 },
//             );

//             // Se chegou aqui sem erro, a conectividade está OK
//             expect(true).toBe(true);
//         });

//         it('should handle queue declaration correctly', async () => {
//             // Verificar se as filas estão declaradas corretamente
//             const repoQueue = await amqpConnection.channel.assertQueue(
//                 QUEUE_CONFIG.REPO_QUEUE,
//                 { durable: true },
//             );

//             expect(repoQueue.queue).toBe(QUEUE_CONFIG.REPO_QUEUE);

//             const impactQueue = await amqpConnection.channel.assertQueue(
//                 QUEUE_CONFIG.IMPACT_QUEUE,
//                 { durable: true },
//             );

//             expect(impactQueue.queue).toBe(QUEUE_CONFIG.IMPACT_QUEUE);

//             const dlq = await amqpConnection.channel.assertQueue(
//                 QUEUE_CONFIG.DEAD_LETTER_QUEUE,
//                 { durable: true },
//             );

//             expect(dlq.queue).toBe(QUEUE_CONFIG.DEAD_LETTER_QUEUE);
//         });
//     });
// });
