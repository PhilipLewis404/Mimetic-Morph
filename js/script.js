(function () {
    const entrada = document.getElementById("entrada");
    const saida = document.getElementById("saida");
    const origem = document.getElementById("origem");
    const destino = document.getElementById("destino");
    const operacao = document.getElementById("operacao");
    const categorias = document.getElementById("categorias");
    const configOrigem = document.getElementById("configOrigem");
    const configDestino = document.getElementById("configDestino");
    const contadorEntrada = document.getElementById("contadorEntrada");
    const contadorSaida = document.getElementById("contadorSaida");
    const mensagemSistema = document.getElementById("mensagemSistema");
    const MAP_SEPARATOR = "·";
    const ESCAPE_START = "⟦";
    const ESCAPE_END = "⟧";

    const estado = {
        sistemas: [],
        categoria: "todos",
        parametros: new Map(),
        audio: null,
        oscilador: null,
        manualAtivo: false,
        timerVisivel: true,
        mutado: false,
        inicioSinal: null,
        timerInterval: null
    };

    const sistemaPortugues = {
        id: "portugues",
        nome: "Português",
        categoria: "Base",
        metodo: "plain",
        codifica: true,
        decodifica: true,
        parametros: []
    };

    const metodos = {
        plain: {
            encode: texto => texto,
            decode: texto => texto
        },
        mapa: {
            encode: (texto, sistema, parametros, options) => converterMapa(texto, sistema.mapa || {}, options?.exact),
            decode: (texto, sistema, parametros, options) => decodificarMapa(texto, sistema.mapa || {}, options?.exact)
        },
        cesar: {
            encode: (texto, sistema, parametros) => cesar(texto, numeroParametro(parametros, "deslocamento", 3)),
            decode: (texto, sistema, parametros) => cesar(texto, -numeroParametro(parametros, "deslocamento", 3))
        },
        erased: {
            encode: (texto, sistema, parametros) => erased(texto, textoParametro(parametros, "caracteres", "AEIOU"))
        },
        binario: {
            encode: texto => paraBinario(texto),
            decode: texto => deBinario(texto)
        },
        hex: {
            encode: texto => paraHex(texto),
            decode: texto => deHex(texto)
        },
        morse: {
            encode: (texto, sistema, parametros, options) => paraMorse(texto, options?.exact),
            decode: (texto, sistema, parametros, options) => deMorse(texto, options?.exact)
        }
    };

    iniciar();

    function iniciar() {
        try {
            const dados = JSON.parse(document.getElementById("mimetic-sistemas").textContent);
            estado.sistemas = [sistemaPortugues, ...dados.systems];
            montarCategorias();
            montarSeletores();
            ligarEventos();
            atualizarInterface();
            atualizar();
            avisarMapasComColisao();
        } catch (erro) {
            mensagem("Não foi possível carregar os sistemas. Recarregue a página e tente novamente.", true);
        }
    }

    function montarCategorias() {
        const nomes = ["todos", ...new Set(estado.sistemas.filter(s => s.id !== "portugues").map(s => s.categoria))];
        categorias.innerHTML = "";

        nomes.forEach(nome => {
            const botao = document.createElement("button");
            botao.type = "button";
            botao.className = "categoria";
            botao.textContent = nome === "todos" ? "Todos" : nome;
            botao.classList.toggle("ativa", nome === estado.categoria);
            botao.addEventListener("click", () => {
                estado.categoria = nome;
                montarCategorias();
                montarSeletores();
                atualizarInterface();
                atualizar();
            });
            categorias.appendChild(botao);
        });
    }

    function montarSeletores() {
        const origemAtual = origem.value || "portugues";
        const destinoAtual = destino.value || "auryth";

        preencherSelect(origem, sistema => sistema.decodifica !== false, origemAtual, true);
        preencherSelect(destino, sistema => sistema.codifica !== false, destinoAtual, true);
    }

    function preencherSelect(select, filtro, valorAtual, usarCategoria) {
        const sistemas = estado.sistemas.filter(sistema => {
            if (!filtro(sistema)) {
                return false;
            }

            return !usarCategoria
                || estado.categoria === "todos"
                || sistema.categoria === estado.categoria
                || sistema.id === "portugues";
        });

        const grupos = new Map();

        sistemas.forEach(sistema => {
            const categoria = sistema.categoria || "Outros";

            if (!grupos.has(categoria)) {
                grupos.set(categoria, []);
            }

            grupos.get(categoria).push(sistema);
        });

        select.innerHTML = "";

        for (const [categoria, itens] of grupos.entries()) {
            if (categoria === "Base") {
                itens.forEach(sistema => appendOption(select, sistema));
                continue;
            }

            const grupo = document.createElement("optgroup");
            grupo.label = categoria;
            itens.forEach(sistema => appendOption(grupo, sistema));
            select.appendChild(grupo);
        }

        if ([...select.options].some(option => option.value === valorAtual)) {
            select.value = valorAtual;
        }
    }

    function appendOption(parent, sistema) {
        const option = document.createElement("option");
        option.value = sistema.id;
        option.textContent = sistema.nome;
        parent.appendChild(option);
    }

    function ligarEventos() {
        operacao.addEventListener("change", atualizar);
        entrada.addEventListener("input", atualizar);
        origem.addEventListener("change", () => {
            atualizarInterface();
            atualizar();
        });
        destino.addEventListener("change", () => {
            atualizarInterface();
            atualizar();
        });

        document.getElementById("trocar").addEventListener("click", trocarSistemas);
        document.getElementById("limpar").addEventListener("click", () => {
            entrada.value = "";
            atualizar();
        });
        document.getElementById("copiarEntrada").addEventListener("click", () => copiar(entrada.value));
        document.getElementById("copiarSaida").addEventListener("click", () => copiar(saida.value));

        ligarMorse();
    }

    function trocarSistemas() {
        const origemSistema = obterSistema(origem.value);
        const destinoSistema = obterSistema(destino.value);

        if (!origemSistema?.codifica || !destinoSistema?.decodifica) {
            mensagem("Essa transformação não tem volta automática.");
            return;
        }

        const antigo = origem.value;
        origem.value = destino.value;
        destino.value = antigo;
        entrada.value = saida.value;
        atualizarInterface();
        atualizar();
    }

    function atualizarInterface() {
        renderizarParametros(configOrigem, origem.value, "decode");
        renderizarParametros(configDestino, destino.value, "encode");

        const temMorse = origem.value === "morse" || destino.value === "morse";
        document.getElementById("morseTools").classList.toggle("ativa", temMorse);
        if (!temMorse) desativarManual();
    }

    function renderizarParametros(container, sistemaId, direcao) {
        const sistema = obterSistema(sistemaId);
        const parametros = (sistema?.parametros || []).filter(parametro => {
            if (!parametro.direcao || parametro.direcao === "ambos") {
                return true;
            }

            return parametro.direcao === direcao;
        });

        container.innerHTML = "";
        container.classList.toggle("ativa", parametros.length > 0);

        if (parametros.length === 0) {
            return;
        }

        const bloco = document.createElement("div");
        bloco.className = "parametros";

        parametros.forEach(parametro => {
            const label = document.createElement("label");
            label.textContent = parametro.nome;

            const input = document.createElement("input");
            input.type = parametro.tipo === "number" ? "number" : "text";
            input.value = valorParametro(sistema.id, parametro.id, parametro.padrao ?? "");
            input.placeholder = parametro.placeholder || "";

            if (parametro.min !== undefined) input.min = parametro.min;
            if (parametro.max !== undefined) input.max = parametro.max;

            input.addEventListener("input", () => {
                definirParametro(sistema.id, parametro.id, input.value);
                atualizar();
            });

            label.appendChild(input);
            bloco.appendChild(label);
        });

        container.appendChild(bloco);
    }

    function atualizar() {
        if (estado.sistemas.length === 0) {
            return;
        }

        const origemSistema = obterSistema(origem.value);
        const destinoSistema = obterSistema(destino.value);

        try {
            saida.value = converterRapido(entrada.value, origemSistema, destinoSistema);
            mensagem("");
        } catch (erro) {
            saida.value = "";
            mensagem(erro.message || "Não consegui converter esse texto.", true);
        }

        contadorEntrada.textContent = `${entrada.value.length} caracteres`;
        contadorSaida.textContent = `${saida.value.length} caracteres`;
    }

    function converterRapido(texto, origemSistema, destinoSistema) {
        if (!destinoSistema || !origemSistema) {
            return texto;
        }

        return operacao.value === "decode"
            ? transformar(texto, origemSistema, "decode")
            : transformar(texto, destinoSistema, "encode");
    }

    function transformar(texto, sistema, direcao, parametros = parametrosDoSistema(sistema?.id), options = {}) {
        if (!sistema) {
            return texto;
        }

        if (direcao === "encode" && sistema.codifica === false) {
            throw new Error(`${sistema.nome} não codifica nesse sentido.`);
        }

        if (direcao === "decode" && sistema.decodifica === false) {
            throw new Error(`${sistema.nome} não decodifica nesse sentido.`);
        }

        const metodo = metodos[sistema.metodo];

        if (!metodo || !metodo[direcao]) {
            throw new Error(`O método ${sistema.metodo} ainda não existe no motor.`);
        }

        return metodo[direcao](texto, sistema, parametros, options);
    }

    function converterMapa(texto, mapa, exact = false) {
        if (!exact) {
            return [...texto].map(c => mapa[c] || c).join("");
        }

        const collided = collidingInputCharacters(mapa);

        return [...texto].map(c => {
            if (collided.has(c) || c === MAP_SEPARATOR || c === ESCAPE_START || c === ESCAPE_END) {
                return escapeCharacter(c);
            }

            return mapa[c] || c;
        }).join(MAP_SEPARATOR);
    }

    function decodificarMapa(texto, mapa, exact = false) {
        const reverso = new Map();

        Object.entries(mapa).forEach(([letra, codigo]) => {
            reverso.set(codigo, letra);
        });

        if (exact && texto.includes(MAP_SEPARATOR)) {
            return texto.split(MAP_SEPARATOR).map(token => {
                return unescapeCharacter(token) ?? reverso.get(token) ?? token;
            }).join("");
        }

        if (exact) {
            const token = unescapeCharacter(texto) ?? reverso.get(texto);
            if (token !== undefined && token !== null) return token;
        }

        const pares = [...reverso.entries()]
            .map(([codigo, letra]) => [letra, codigo])
            .sort((a, b) => b[1].length - a[1].length);
        let resultado = "";
        let posicao = 0;

        while (posicao < texto.length) {
            let encontrou = false;

            for (const [letra, codigo] of pares) {
                if (texto.startsWith(codigo, posicao)) {
                    resultado += letra;
                    posicao += codigo.length;
                    encontrou = true;
                    break;
                }
            }

            if (!encontrou) {
                resultado += texto[posicao];
                posicao++;
            }
        }

        return resultado;
    }

    function collidingInputCharacters(mapa) {
        const outputs = new Map();

        Object.entries(mapa).forEach(([letra, codigo]) => {
            if (!outputs.has(codigo)) {
                outputs.set(codigo, []);
            }

            outputs.get(codigo).push(letra);
        });

        return new Set([...outputs.values()].filter(letras => letras.length > 1).flat());
    }

    function escapeCharacter(character) {
        return `${ESCAPE_START}${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}${ESCAPE_END}`;
    }

    function unescapeCharacter(token) {
        const match = token.match(/^⟦([0-9A-F]+)⟧$/);

        if (!match) {
            return null;
        }

        return String.fromCodePoint(parseInt(match[1], 16));
    }

    function cesar(texto, deslocamento) {
        return [...texto].map(letra => {
            const codigo = letra.charCodeAt(0);

            if (codigo >= 65 && codigo <= 90) {
                return String.fromCharCode(((codigo - 65 + deslocamento + 26) % 26) + 65);
            }

            if (codigo >= 97 && codigo <= 122) {
                return String.fromCharCode(((codigo - 97 + deslocamento + 26) % 26) + 97);
            }

            return letra;
        }).join("");
    }

    function erased(texto, caracteres) {
        const remover = caracteres.toLowerCase();
        return [...texto].filter(letra => !remover.includes(letra.toLowerCase())).join("");
    }

    function textoParaBytes(texto) {
        return new TextEncoder().encode(texto);
    }

    function bytesParaTexto(bytes) {
        return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
    }

    function paraBinario(texto) {
        return [...textoParaBytes(texto)].map(byte => byte.toString(2).padStart(8, "0")).join(" ");
    }

    function deBinario(texto) {
        const limpo = texto.trim();
        if (!limpo) return "";

        const bytes = limpo.split(/\s+/).map(valor => {
            if (!/^[01]{8}$/.test(valor)) {
                throw new Error("Binário precisa estar em grupos de 8 bits.");
            }

            return parseInt(valor, 2);
        });

        return bytesParaTexto(bytes);
    }

    function paraHex(texto) {
        return [...textoParaBytes(texto)].map(byte => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
    }

    function deHex(texto) {
        const limpo = texto.trim();
        if (!limpo) return "";

        const partes = limpo.match(/[0-9a-fA-F]{2}/g) || [];
        const normalizado = limpo.replace(/\s+/g, "");

        if (partes.join("") !== normalizado || normalizado.length % 2 !== 0) {
            throw new Error("Hexadecimal precisa estar em pares válidos.");
        }

        return bytesParaTexto(partes.map(valor => parseInt(valor, 16)));
    }

    const morse = {
        A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....",
        I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.",
        Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
        Y: "-.--", Z: "--..", 0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-",
        5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----."
    };

    function paraMorse(texto, exact = false) {
        if (exact) {
            return [...texto].map(c => c === " " ? "/" : morse[c] || escapeCharacter(c)).join(" ");
        }
        return texto.toUpperCase().split("").map(c => c === " " ? "/" : morse[c] || c).join(" ");
    }

    function deMorse(texto, exact = false) {
        const reverso = Object.fromEntries(Object.entries(morse).map(([letra, codigo]) => [codigo, letra]));

        return texto.trim().split(/\s+/).filter(Boolean).map(codigo => {
            if (exact) {
                const literal = unescapeCharacter(codigo);
                if (literal !== null) return literal;
            }
            if (codigo === "/") return " ";
            return reverso[codigo] || codigo;
        }).join("");
    }

    function ligarMorse() {
        const manualMorse = document.getElementById("manualMorse");
        const sinalizadorArea = document.getElementById("sinalizadorArea");
        const botaoSinal = document.getElementById("botaoSinal");
        const timerDisplay = document.getElementById("timerDisplay");

        manualMorse.addEventListener("click", () => {
            if (estado.manualAtivo) {
                desativarManual();
                return;
            }
            estado.manualAtivo = !estado.manualAtivo;
            manualMorse.classList.toggle("ativo", estado.manualAtivo);
            sinalizadorArea.classList.toggle("ativa", estado.manualAtivo);
        });

        document.getElementById("timerMorse").addEventListener("click", event => {
            estado.timerVisivel = !estado.timerVisivel;
            timerDisplay.style.display = estado.timerVisivel ? "block" : "none";
            event.currentTarget.classList.toggle("ativo", estado.timerVisivel);
        });

        document.getElementById("muteMorse").addEventListener("click", event => {
            estado.mutado = !estado.mutado;
            event.currentTarget.textContent = estado.mutado ? "Mudo" : "Som";
            event.currentTarget.classList.toggle("ativo", estado.mutado);
            pararSom();
        });

        document.getElementById("playMorse").addEventListener("click", reproduzirMorse);
        document.getElementById("espacoMorse").addEventListener("click", () => {
            entrada.value += " ";
            atualizar();
        });

        botaoSinal.addEventListener("pointerdown", event => {
            event.preventDefault();
            iniciarSinal(botaoSinal, timerDisplay);
        });
        botaoSinal.addEventListener("pointerup", () => finalizarSinal(botaoSinal, timerDisplay));
        botaoSinal.addEventListener("pointerleave", () => finalizarSinal(botaoSinal, timerDisplay));
        botaoSinal.addEventListener("pointercancel", cancelarSinal);
        window.addEventListener("blur", cancelarSinal);

        document.addEventListener("keydown", event => {
            if (!estado.manualAtivo) return;

            if (event.code === "Space") {
                event.preventDefault();
                if (!event.repeat) iniciarSinal(botaoSinal, timerDisplay);
            }

            if (event.code === "Enter") {
                event.preventDefault();
                if (!event.repeat) {
                    entrada.value += " ";
                    atualizar();
                }
            }
        });

        document.addEventListener("keyup", event => {
            if (estado.manualAtivo && event.code === "Space") {
                event.preventDefault();
                finalizarSinal(botaoSinal, timerDisplay);
            }
        });
    }

    function cancelarSinal() {
        clearInterval(estado.timerInterval);
        estado.timerInterval = null;
        estado.inicioSinal = null;
        pararSom();
        document.getElementById("botaoSinal").classList.remove("pressionado");
        document.getElementById("timerDisplay").textContent = "0.000 s";
    }

    function desativarManual() {
        cancelarSinal();
        estado.manualAtivo = false;
        document.getElementById("manualMorse").classList.remove("ativo");
        document.getElementById("sinalizadorArea").classList.remove("ativa");
    }

    function iniciarSinal(botao, timerDisplay) {
        if (!estado.manualAtivo || estado.inicioSinal !== null) return;

        estado.inicioSinal = performance.now();
        botao.classList.add("pressionado");
        iniciarSom();
        estado.timerInterval = setInterval(() => {
            const duracao = (performance.now() - estado.inicioSinal) / 1000;
            timerDisplay.textContent = `${duracao.toFixed(3)} s`;
        }, 20);
    }

    function finalizarSinal(botao, timerDisplay) {
        if (estado.inicioSinal === null) return;

        const duracao = performance.now() - estado.inicioSinal;
        clearInterval(estado.timerInterval);
        pararSom();
        botao.classList.remove("pressionado");
        entrada.value += duracao < 300 ? "." : "-";
        estado.inicioSinal = null;
        timerDisplay.textContent = "0.000 s";
        atualizar();
    }

    async function reproduzirMorse() {
        const texto = destino.value === "morse" ? saida.value : entrada.value;
        const sinais = texto.match(/[.-]|\/|\s/g) || [];

        for (const sinal of sinais) {
            if (sinal === ".") await beep(120);
            if (sinal === "-") await beep(360);
            await esperar(sinal === "/" ? 360 : 120);
        }
    }

    function iniciarSom() {
        if (estado.mutado) return;
        const audio = audioContext();
        const oscilador = audio.createOscillator();
        const ganho = audio.createGain();

        oscilador.frequency.value = 650;
        ganho.gain.value = 0.05;
        oscilador.connect(ganho).connect(audio.destination);
        oscilador.start();
        estado.oscilador = oscilador;
    }

    function pararSom() {
        if (!estado.oscilador) return;
        estado.oscilador.stop();
        estado.oscilador = null;
    }

    async function beep(ms) {
        if (!estado.mutado) {
            iniciarSom();
        }

        await esperar(ms);
        pararSom();
    }

    function audioContext() {
        if (!estado.audio) {
            estado.audio = new (window.AudioContext || window.webkitAudioContext)();
        }

        return estado.audio;
    }

    function esperar(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function obterSistema(id) {
        return estado.sistemas.find(sistema => sistema.id === id);
    }

    function parametrosDoSistema(sistemaId) {
        return estado.parametros.get(sistemaId) || {};
    }

    function valorParametro(sistemaId, parametroId, padrao) {
        return parametrosDoSistema(sistemaId)[parametroId] ?? padrao;
    }

    function definirParametro(sistemaId, parametroId, valor) {
        estado.parametros.set(sistemaId, {
            ...parametrosDoSistema(sistemaId),
            [parametroId]: valor
        });
    }

    function numeroParametro(parametros, id, padrao) {
        const numero = Number(parametros[id] ?? padrao);
        return Number.isFinite(numero) ? numero : padrao;
    }

    function textoParametro(parametros, id, padrao) {
        return String(parametros[id] ?? padrao);
    }

    async function copiar(texto) {
        try {
            await navigator.clipboard.writeText(texto);
            mensagem("Copiado.");
        } catch {
            mensagem("Não consegui copiar automaticamente.", true);
        }
    }

    function mensagem(texto, erro = false) {
        mensagemSistema.textContent = texto;
        mensagemSistema.classList.toggle("erro", erro);
    }

    function avisarMapasComColisao() {
        const sistema = estado.sistemas.find(item => item.avisos?.length);

        if (sistema) {
            mensagem(`${sistema.nome} tem colisões no mapa; alguns caracteres podem não voltar exatamente.`);
        }
    }
})();
