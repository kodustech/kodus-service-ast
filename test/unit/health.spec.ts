// Teste simples para validar configuração Jest
describe('Health Check', () => {
    test('Jest configuration is working', () => {
        expect(true).toBe(true);
    });

    test('Basic math works', () => {
        expect(2 + 2).toBe(4);
    });

    test('Environment is set up', () => {
        expect(process.env.NODE_ENV).toBeDefined();
    });
});
