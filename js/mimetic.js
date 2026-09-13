const mimetic = document.querySelector(".mimetic");

let mordendo = false;

document.addEventListener("click", () => {

    if (mordendo) {
        return;
    }

    mordendo = true;


    // 1. Fecha a boca
    mimetic.classList.add("fechado");


    // 2. Quando fechar, a logo começa a encolher
    setTimeout(() => {

        mimetic.classList.add("logo-encolhendo");

    }, 200);


    // 3. Depois de pequena, desaparece
    setTimeout(() => {

        mimetic.classList.add("logo-escondida");

    }, 210);


    // 4. Abre na posição final
    setTimeout(() => {

        mimetic.classList.remove("fechado");
        mimetic.classList.add("aberto-final");

        setTimeout(() => {

            document.body.classList.add("site-ativo");

            mordendo = false;

        }, 250);

    }, 1250);

});