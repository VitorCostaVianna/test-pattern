import { CheckoutService } from '../src/services/CheckoutService.js';
import { Pedido } from '../src/domain/Pedido.js';
import { Item } from '../src/domain/Item.js';
import { CarrinhoBuilder } from './builders/CarrinhoBuilder.js';
import { UserMother } from './builders/UserMother.js';

describe('CheckoutService', () => {
    const cartaoCredito = { numero: '4111111111111111', validade: '12/30', cvv: '123' };

    describe('quando o pagamento falha', () => {
        let carrinho;
        let gatewayStub;

        beforeEach(() => {
            carrinho = new CarrinhoBuilder().build();
            // Stub: fornece resposta pronta de pagamento recusado
            gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: false }) };
        });

        it('deve retornar null', async () => {
            // Arrange
            // Dummies: objetos vazios, só preenchem o construtor e não devem ser usados
            const repositoryDummy = {};
            const emailServiceDummy = {};
            const checkoutService = new CheckoutService(gatewayStub, repositoryDummy, emailServiceDummy);

            // Act
            const pedido = await checkoutService.processarPedido(carrinho, cartaoCredito);

            // Assert (verificação de estado)
            expect(pedido).toBeNull();
        });

        it('não deve salvar o pedido nem enviar e-mail', async () => {
            // Arrange
            // Aqui os colaboradores são jest.fn() (spies), pois a verificação é que NÃO foram chamados
            const repositorySpy = { salvar: jest.fn() };
            const emailServiceSpy = { enviarEmail: jest.fn() };
            const checkoutService = new CheckoutService(gatewayStub, repositorySpy, emailServiceSpy);

            // Act
            await checkoutService.processarPedido(carrinho, cartaoCredito);

            // Assert (verificação de comportamento)
            expect(repositorySpy.salvar).not.toHaveBeenCalled();
            expect(emailServiceSpy.enviarEmail).not.toHaveBeenCalled();
        });
    });

    describe('quando o carrinho está vazio', () => {
        it('deve cobrar o valor zero, pois o SUT não valida carrinho vazio', async () => {
            // Arrange
            const carrinhoVazio = new CarrinhoBuilder().vazio().build();
            // Stub: pagamento aprovado
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            // Stub: devolve o pedido recebido com um id atribuído
            const repositoryStub = {
                salvar: jest.fn().mockImplementation(async (pedido) =>
                    new Pedido(1, pedido.carrinho, pedido.totalFinal, pedido.status)),
            };
            // Stub: e-mail enviado sem erro (não é o foco deste teste)
            const emailServiceStub = { enviarEmail: jest.fn().mockResolvedValue(undefined) };
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailServiceStub);

            // Act
            const pedido = await checkoutService.processarPedido(carrinhoVazio, cartaoCredito);

            // Assert
            expect(gatewayStub.cobrar).toHaveBeenCalledWith(0, cartaoCredito);
            expect(pedido.totalFinal).toBe(0);
        });
    });

    describe('quando um cliente Premium finaliza a compra', () => {
        it('deve cobrar com 10% de desconto e enviar e-mail de confirmação', async () => {
            // Arrange
            const usuarioPremium = UserMother.umUsuarioPremium();
            const carrinho = new CarrinhoBuilder()
                .comUser(usuarioPremium)
                .comItens([new Item('Item A', 120), new Item('Item B', 80)])
                .build();
            // Stub: pagamento aprovado
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            // Stub: devolve o pedido salvo com id
            const pedidoSalvo = new Pedido(42, carrinho, 180, 'PROCESSADO');
            const repositoryStub = { salvar: jest.fn().mockResolvedValue(pedidoSalvo) };
            // Mock: verificamos as interações com o serviço de e-mail
            const emailMock = { enviarEmail: jest.fn().mockResolvedValue(undefined) };
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailMock);

            // Act
            await checkoutService.processarPedido(carrinho, cartaoCredito);

            // Assert (verificação de comportamento)
            expect(gatewayStub.cobrar).toHaveBeenCalledWith(180, cartaoCredito);
            expect(emailMock.enviarEmail).toHaveBeenCalledTimes(1);
            expect(emailMock.enviarEmail).toHaveBeenCalledWith(
                'premium@email.com',
                'Seu Pedido foi Aprovado!',
                'Pedido 42 no valor de R$180'
            );
        });
    });

    describe('quando um cliente padrão finaliza a compra', () => {
        let carrinho;
        let gatewayStub;
        let repositoryStub;
        let emailServiceStub;
        let checkoutService;

        beforeEach(() => {
            carrinho = new CarrinhoBuilder().build(); // usuário padrão + 1 item de R$100
            // Stub: pagamento aprovado
            gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            // Stub: devolve o pedido recebido com um id atribuído
            repositoryStub = {
                salvar: jest.fn().mockImplementation(async (pedido) =>
                    new Pedido(7, pedido.carrinho, pedido.totalFinal, pedido.status)),
            };
            // Stub: e-mail enviado sem erro (não é o foco destes testes)
            emailServiceStub = { enviarEmail: jest.fn().mockResolvedValue(undefined) };
            checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailServiceStub);
        });

        it('deve retornar o pedido salvo com o totalFinal sem desconto', async () => {
            // Arrange (feito no beforeEach)

            // Act
            const pedido = await checkoutService.processarPedido(carrinho, cartaoCredito);

            // Assert (verificação de estado)
            expect(pedido).not.toBeNull();
            expect(pedido.id).toBe(7);
            expect(pedido.totalFinal).toBe(100);
            expect(pedido.status).toBe('PROCESSADO');
        });

        it('deve cobrar o valor cheio no gateway', async () => {
            // Arrange (feito no beforeEach)

            // Act
            await checkoutService.processarPedido(carrinho, cartaoCredito);

            // Assert
            expect(gatewayStub.cobrar).toHaveBeenCalledWith(100, cartaoCredito);
        });
    });
});
