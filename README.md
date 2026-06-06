# Diamond Delivery

Sistema estatico para GitHub Pages com visual dark/RGB. O GitHub mostra a tela; o servidor local e o `.env` ficam somente no seu PC.

## Arquivos Que Sobem Para O GitHub Pages

Suba estes arquivos:

```text
.nojekyll
.gitignore
.env.example
README.md
index.html
app.js
styles.css
env.js
diamond.png
manifest.json
atendimento.html
anota-coletor.html
scripts/anota-ai-coletor.js
.github/workflows/pages.yml
```

Nao suba:

```text
.env
server.py
ligar-servidor.sh
ligar-servidor-bg.sh
parar-servidor.sh
ligar-tunnel.sh
ligar-tunnel-bg.sh
parar-tunnel.sh
logs/
supabase/
```

O `.gitignore` ja esconde esses arquivos locais.

## Commit Pelo VS Code

1. Abra a pasta `Diamond Delivery` no VS Code.
2. Clique no icone `Source Control` na esquerda.
3. Se aparecer `Initialize Repository`, clique nele.
4. Escreva a mensagem do commit, por exemplo:

```text
atualiza pdv diamond
```

5. Clique em `Commit`.
6. Clique em `Publish Branch` ou `Sync Changes`.

Se o VS Code pedir o repositorio remoto, use:

```text
https://github.com/Somorak2/diamond-delivery.git
```

Depois veja em:

```text
https://somorak2.github.io/diamond-delivery/
```

## Importar Do Anota AI

1. Abra no seu site:

```text
https://somorak2.github.io/diamond-delivery/anota-coletor.html
```

2. Clique em `Copiar coletor`.
3. Abra o Anota AI logado.
4. Pressione `F12`, abra a aba `Console`, cole o codigo e aperte `Enter`.
5. Navegue no Anota AI pelas telas de mesas, produtos, cardapio e delivery.
6. No painel `Diamond Coletor`, clique em `Copiar JSON`.
7. Volte no Diamond Delivery, entre como admin e abra `Adm > Importar`.
8. Cole o JSON e clique em `Importar mantendo dados`.

O coletor nao exporta senha, cookie, token nem authorization. Ele tenta pegar apenas mesas, produtos, categorias, precos e estoque.

## Servidor Local

Para usar Supabase pelo seu PC:

```bash
cd "/home/host/Documentos/Diamond Delivery"
./ligar-servidor.sh
```

Para celular/outro aparelho, ligue tambem o tunnel:

```bash
./ligar-tunnel.sh
```

Abra o GitHub Pages com a URL do tunnel:

```text
https://somorak2.github.io/diamond-delivery/?api=https://SUA_URL.trycloudflare.com
```
