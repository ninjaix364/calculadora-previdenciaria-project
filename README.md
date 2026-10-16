# Calculadora de Atrasados Previdenciários

Protótipo em HTML, CSS e JavaScript puro, com integração opcional server-side à API da Fábrica de Cálculos (TRF3).

## Sobre o Projeto

Este projeto foi desenvolvido com dois objetivos principais:

1. **Portfólio Pessoal:** Demonstrar na prática a criação de soluções web, manipulação de APIs e integração _server-side_ segura usando Node.js.
2. **Plataforma Open-Source:** Disponibilizar para a comunidade um código aberto, simples e funcional que sirva como base ou referência para quem precisa integrar com os serviços da Fábrica de Cálculos (TRF3).

## Requisitos

- Node.js 20 ou superior.
- Chave de API pessoal e autorizada pela plataforma Fábrica de Cálculos para executar os endpoints protegidos. A aplicação não inclui nem gera uma chave. Solicitação: https://fabrica-de-calculos.app.trf3.jus.br/solicitar-api-key.

## Executar localmente

1. Extraia a pasta do projeto.
2. Copie `.env.example` para um arquivo chamado `.env`.
3. Solicite sua própria chave em https://fabrica-de-calculos.app.trf3.jus.br/solicitar-api-key, aguarde a análise e consulte as condições de uso vigentes.
4. Preencha `FC_API_KEY` com a chave autorizada. Não coloque a chave em `script.js` nem a publique no repositório.
5. Abra um terminal nesta pasta e execute:

   ```bash
   npm start
   ```

6. Acesse `http://localhost:3000` no navegador. Não abra `index.html` diretamente, pois a chamada à API passa pelo servidor Node.

Não há dependências npm externas: o servidor usa os módulos nativos do Node e `fetch` integrado ao Node 20+.

## O que foi integrado

- `GET /api/health`: informa se a chave está configurada, sem revelar a chave.
- `POST /api/fabrica/calcular-atrasados`: recebe um arquivo `.calc` como `multipart/form-data` no campo `file` e o encaminha para:

  `POST https://fabrica-de-calculos.app.trf3.jus.br/rgps/api/v1/calculos-atrasados/arquivo-calc/calcular`

- A chave é adicionada no servidor pelo cabeçalho `x-api-key`, não é enviada ao navegador.
- A resposta JSON da API aparece na página e pode ser baixada como arquivo `.json`.
- A interface mostra erros de autenticação, validação, indisponibilidade e conexão retornados pelo serviço.

## Por que usar arquivo `.calc`?

A API de atrasados não recebe apenas um valor mensal e duas datas; o contrato do motor abrange uma liquidação previdenciária com parâmetros e estruturas adicionais. Por isso, a integração desta versão encaminha um arquivo `.calc` preparado em uma calculadora compatível, em vez de inventar um payload jurídico incompleto com base nos campos simples do protótipo local.

Você pode abrir a calculadora oficial em https://fabrica-de-calculos.app.trf3.jus.br/atrasados e verificar como criar/exportar o arquivo de cálculo compatível.

## Segurança e limitações

- Uma chave válida precisa ser solicitada e concedida pela plataforma. O titular deve seguir os termos vigentes; a chave é pessoal, sigilosa e intransferível. Não use uma chave individual para oferecer o serviço a terceiros nem implante a aplicação para acesso público sem confirmar que o uso proposto e a titularidade/escopo da chave foram autorizados pela plataforma.
- O arquivo enviado pode conter dados pessoais ou processuais. O envio transfere o arquivo à plataforma externa; confirme autorização, base legal e termos de uso antes de enviar dados reais.
- O protótipo não grava o arquivo recebido no disco. A plataforma externa pode registrar dados de operação conforme sua documentação e políticas.
- A chamada não ativa `permalink=true` nem `demonstrativo=true`, evitando criar intencionalmente um snapshot persistido ou demonstrativo adicional.
- A integração externa está preparada no código, mas deve ser validada com uma chave autorizada e um arquivo `.calc` válido antes de uso operacional.
- A calculadora manual existente continua separada. Ela estima diferenças mensais e fatores informados pelo usuário; não seleciona automaticamente uma regra jurídica nem substitui um cálculo oficial/judicial.

## Documentação

- API de cálculos previdenciários: https://fabrica-de-calculos.app.trf3.jus.br/docs-tec/apis/prev-api.html
- Portal de APIs: https://fabrica-de-calculos.app.trf3.jus.br/docs-api
- Calculadora oficial de atrasados: https://fabrica-de-calculos.app.trf3.jus.br/atrasados
