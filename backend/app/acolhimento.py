"""Orientações para a equipe: cruza o perfil sensorial do cliente (MongoDB)
com as características do serviço (SQLite) e devolve frases prontas para o
cartão de atendimento."""


def orientacoes(perfil: dict | None, servico: dict, primeira_visita: bool) -> list[str]:
    dicas: list[str] = []
    if primeira_visita:
        dicas.append("Primeira visita: apresente o espaço e explique cada etapa antes de começar.")
    if not perfil:
        return dicas

    sens = perfil.get("sensibilidades") or {}
    pref = perfil.get("preferencias") or {}

    if (sens.get("ruido") or 0) >= 2:
        if servico["nivel_ruido"] >= 2:
            dicas.append("Este serviço usa aparelho barulhento: ofereça protetor de ouvido "
                         "ou secagem natural e avise antes de ligar.")
        else:
            dicas.append("Sensível a barulho: prefira a cadeira mais afastada dos secadores.")
    if (sens.get("cheiros") or 0) >= 2:
        if servico["nivel_cheiro"] >= 2:
            dicas.append("Este serviço usa produto de cheiro forte: abra a janela e "
                         "ofereça a opção sem perfume.")
        else:
            dicas.append("Sensível a cheiros: evite borrifar produtos perfumados por perto.")
    if (sens.get("luz") or 0) >= 2:
        dicas.append("Sensível a luz: use a bancada com luz indireta e evite o ring light.")
    if (sens.get("toque") or 0) >= 2:
        if servico["contato_fisico"] >= 2:
            dicas.append("Este serviço exige bastante toque: avise antes de cada contato "
                         "e pergunte sobre a pressão.")
        else:
            dicas.append("Sensível a toque: avise antes de encostar.")

    if pref.get("pouca_conversa"):
        dicas.append("Prefere pouca conversa durante o atendimento.")
    if pref.get("avisar_antes_de_tocar") and (sens.get("toque") or 0) < 2:
        dicas.append("Avise antes de tocar.")
    if pref.get("explicar_etapas"):
        dicas.append("Explique cada etapa antes de fazer.")
    if pref.get("pausas"):
        dicas.append("Pode precisar de pausas: combine um sinal para parar.")
    if pref.get("acompanhante"):
        dicas.append("Vem com acompanhante: reserve um lugar ao lado.")
    if pref.get("comunicacao") == "escrita":
        dicas.append("Prefere comunicação por escrito (mensagem ou papel).")
    if perfil.get("observacoes"):
        dicas.append(f"Observação do cliente: {perfil['observacoes']}")
    return dicas
