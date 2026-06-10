// =====================================================
// BiblioSync v2.0 — Lógica principal de la SPA
// =====================================================

// =====================================================
// 1. CONFIGURACIÓN GLOBAL
// =====================================================
const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? `${window.location.protocol}//${window.location.hostname}:${window.location.port}/api`
    : "/api";

const HUB_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? `${window.location.protocol}//${window.location.hostname}:${window.location.port}/hubs/chat`
    : "/hubs/chat";

// Estado global en memoria
let tokenJWT            = "";
let usuarioActual       = null;
let hubConexion         = null;
let prestamoIdPendiente = null;
let convActivaId        = null;      // ID del usuario en la conversación abierta
let convActivaNombre    = "";
let usuariosOnline      = new Set();
let typingTimeout       = null;

// =====================================================
// 2. UTILIDADES
// =====================================================

function esc(str) {
    if (str === null || str === undefined) return "";
    const d = document.createElement("div");
    d.textContent = String(str);
    return d.innerHTML;
}

function normalizar(str) {
    if (!str) return "";
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function formatearFecha(fechaUtc) {
    if (!fechaUtc) return "—";
    const fecha = fechaUtc.endsWith("Z") ? fechaUtc : fechaUtc + "Z";
    return new Date(fecha).toLocaleDateString("es-CO", {
        day: "2-digit", month: "2-digit", year: "numeric"
    });
}

function formatearFechaHora(fechaUtc) {
    if (!fechaUtc) return "—";
    const fecha = fechaUtc.endsWith("Z") ? fechaUtc : fechaUtc + "Z";
    return new Date(fecha).toLocaleString("es-CO", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}

function formatearHora(fechaUtc) {
    if (!fechaUtc) return "";
    // Asegurar que la fecha se interprete como UTC agregando Z si no la tiene
    const fecha = fechaUtc.endsWith("Z") ? fechaUtc : fechaUtc + "Z";
    return new Date(fecha).toLocaleTimeString("es-CO", {
        hour: "2-digit", minute: "2-digit"
    });
}

function mostrarToast(mensaje, tipo = "info", duracion = 3500) {
    const contenedor = document.getElementById("toastContenedor");
    const iconos = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
    const toast = document.createElement("div");
    toast.className = `toast ${tipo}`;
    toast.innerHTML = `<span>${iconos[tipo] || "ℹ️"}</span><span>${esc(mensaje)}</span>`;
    contenedor.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("visible")));
    setTimeout(() => {
        toast.classList.remove("visible");
        setTimeout(() => toast.remove(), 300);
    }, duracion);
}

function headersAuth() {
    return { "Content-Type": "application/json", "Authorization": `Bearer ${tokenJWT}` };
}

async function apiFetch(url, opciones = {}) {
    try {
        const res = await fetch(url, opciones);
        if (res.status === 401) {
            // Solo cerrar sesión si hay una sesión activa
            if (tokenJWT && usuarioActual) {
                mostrarToast("Tu sesión expiró. Inicia sesión nuevamente.", "warning");
                cerrarSesion();
            }
            return null;
        }
        return res;
    } catch {
        // Solo mostrar error de conexión si hay sesión activa
        if (tokenJWT) {
            mostrarToast("Error de conexión con el servidor.", "error");
        }
        return null;
    }
}

function renderFotoPerfil(fotoUrl, nombre, claseGrande = false) {
    const cls = claseGrande ? "inicial-perfil-grande foto-perfil-grande" : "inicial-perfil-card foto-perfil-card";
    const clsI = claseGrande ? "inicial-perfil-grande" : "inicial-perfil-card";
    const clsF = claseGrande ? "foto-perfil-grande" : "foto-perfil-card";
    const inicial = (nombre || "?")[0].toUpperCase();
    if (fotoUrl) {
        return `<img src="${esc(fotoUrl)}" alt="${esc(nombre)}" class="${clsF}"
                    onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                <div class="${clsI}" style="display:none;">${esc(inicial)}</div>`;
    }
    return `<div class="${clsI}">${esc(inicial)}</div>`;
}

// =====================================================
// 3. MODALES
// =====================================================

function abrirModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add("abierto");
}

function cerrarModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove("abierto");
}

document.addEventListener("click", (e) => {
    // Solo cerrar modales si la pantalla principal está visible
    if (document.getElementById("pantallaPrincipal").style.display === "none") return;
    if (e.target.classList.contains("modal") && e.target.classList.contains("abierto"))
        e.target.classList.remove("abierto");
});

// =====================================================
// 4. NAVEGACIÓN AUTH
// =====================================================

async function mostrarFormAuth(cual) {
    ["formLogin", "formRegistro", "formRecuperar"].forEach(id => {
        document.getElementById(id).style.display = "none";
    });
    const mapa = { login: "formLogin", registro: "formRegistro", recuperar: "formRecuperar" };
    if (mapa[cual]) document.getElementById(mapa[cual]).style.display = "block";
    if (cual === "recuperar") resetarRecuperacion();

    // Si abre el registro, verificar si es el primer usuario
    if (cual === "registro") {
        try {
            const res = await fetch(`${API_URL}/Usuarios/primer-registro`);
            const data = await res.json();
            const select = document.getElementById("regRol");
            if (data.esPrimero) {
                // Primer usuario — puede elegir Administrador Principal
                select.innerHTML = `
                    <option value="Estudiante">Estudiante</option>
                    <option value="Docente">Docente</option>
                    <option value="AdminPrincipal">⭐ Administrador Principal</option>`;
            } else {
                // Ya hay usuarios — solo Estudiante y Docente
                select.innerHTML = `
                    <option value="Estudiante">Estudiante</option>
                    <option value="Docente">Docente</option>`;
            }
        } catch {
            // Si falla, dejar solo las opciones normales
        }
    }
}

function resetarRecuperacion() {
    document.getElementById("pasoSolicitarCodigo").style.display  = "block";
    document.getElementById("pasoCodigoPassword").style.display   = "none";
    document.getElementById("codigoMostrado").style.display       = "none";
    ["recCedula", "recCodigo", "recPasswordNueva", "recPasswordConfirm"]
        .forEach(id => { document.getElementById(id).value = ""; });
}

// Enter en login
document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const activo = document.activeElement;
    if (activo && (activo.id === "loginUsuario" || activo.id === "loginPassword"))
        iniciarSesion();
});

// =====================================================
// 5. AUTENTICACIÓN
// =====================================================

async function iniciarSesion() {
    const usuario  = document.getElementById("loginUsuario").value.trim();
    const password = document.getElementById("loginPassword").value;
    if (!usuario || !password) { mostrarToast("Completa todos los campos.", "warning"); return; }

    const res = await apiFetch(`${API_URL}/Usuarios/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, password })
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Credenciales incorrectas.", "error"); return; }

    tokenJWT      = data.token;
    usuarioActual = data.usuario;

    document.getElementById("loginUsuario").value  = "";
    document.getElementById("loginPassword").value = "";

    iniciarPantallaPrincipal();
}

async function registrarUsuario() {
    const nombre          = document.getElementById("regNombre").value.trim();
    const cedula          = document.getElementById("regCedula").value.trim();
    const correo          = document.getElementById("regCorreo").value.trim();
    const password        = document.getElementById("regPassword").value;
    const passwordConfirm = document.getElementById("regPasswordConfirm").value;
    const tipoRolSeleccionado = document.getElementById("regRol").value;
    // AdminPrincipal es un valor especial del frontend — se mapea en el backend
    const tipoRol = tipoRolSeleccionado === "AdminPrincipal" ? "Administrador" : tipoRolSeleccionado;
    const esPrincipal = tipoRolSeleccionado === "AdminPrincipal";

    if (!nombre || !cedula || !correo || !password) {
        mostrarToast("Completa todos los campos.", "warning"); return;
    }
    if (password !== passwordConfirm) { mostrarToast("Las contraseñas no coinciden.", "warning"); return; }
    if (password.length < 6) { mostrarToast("Mínimo 6 caracteres.", "warning"); return; }

    const res = await apiFetch(`${API_URL}/Usuarios/registrar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, cedula, correo, password, tipoRol, esPrincipal })
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error al registrar.", "error"); return; }

    mostrarToast("Cuenta creada exitosamente. Inicia sesión.", "success");
    mostrarFormAuth("login");
}

// =====================================================
// 6. RECUPERACIÓN DE CONTRASEÑA
// =====================================================

async function solicitarCodigo() {
    const cedula = document.getElementById("recCedula").value.trim();
    if (!cedula) { mostrarToast("Ingresa tu cédula.", "warning"); return; }

    const res = await apiFetch(`${API_URL}/Usuarios/solicitar-recuperacion`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula })
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error.", "error"); return; }

    document.getElementById("pasoSolicitarCodigo").style.display = "none";
    document.getElementById("pasoCodigoPassword").style.display  = "block";

    if (data.codigo) {
        document.getElementById("codigoValor").textContent       = data.codigo;
        document.getElementById("codigoMostrado").style.display  = "flex";
    }
    mostrarToast("Código generado. Tienes 15 minutos.", "info");
}

async function recuperarPassword() {
    const cedula          = document.getElementById("recCedula").value.trim();
    const codigo          = document.getElementById("recCodigo").value.trim().toUpperCase();
    const nuevaPassword   = document.getElementById("recPasswordNueva").value;
    const confirmPassword = document.getElementById("recPasswordConfirm").value;

    if (!codigo || !nuevaPassword) { mostrarToast("Completa el código y la nueva contraseña.", "warning"); return; }
    if (nuevaPassword !== confirmPassword) { mostrarToast("Las contraseñas no coinciden.", "warning"); return; }
    if (nuevaPassword.length < 6) { mostrarToast("Mínimo 6 caracteres.", "warning"); return; }

    const res = await apiFetch(`${API_URL}/Usuarios/recuperar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula, codigo, nuevaPassword })
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Código inválido.", "error"); return; }

    mostrarToast("Contraseña actualizada.", "success");
    mostrarFormAuth("login");
}

// =====================================================
// 7. SIGNALR — CONEXIÓN Y EVENTOS
// =====================================================

async function conectarSignalR() {
    hubConexion = new signalR.HubConnectionBuilder()
        .withUrl(`${HUB_URL}?access_token=${tokenJWT}`)
        .withAutomaticReconnect()
        .build();

    // Nuevo mensaje recibido — notificación toast
    hubConexion.on("NuevoMensaje", (data) => {
        // Si estamos en la conversación con ese usuario, refrescar chat
        if (convActivaId === data.remitenteId) {
            cargarMensajesConversacion(data.remitenteId, false);
        } else {
            // Mostrar notificación toast con foto y preview
            const fotoHtml = data.fotoUrl
                ? `<img src="${esc(data.fotoUrl)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
                : `<div style="width:32px;height:32px;border-radius:50%;background:var(--secondary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">${esc(data.nombre[0])}</div>`;

            const contenedor = document.getElementById("toastContenedor");
            const toast = document.createElement("div");
            toast.className = "toast info";
            toast.style.cssText = "cursor:pointer; align-items:flex-start; gap:10px;";
            toast.innerHTML = `
                ${fotoHtml}
                <div style="min-width:0;">
                    <div style="font-weight:700;margin-bottom:2px;">${esc(data.nombre)}</div>
                    <div style="font-size:13px;opacity:0.9;">${esc(data.preview)}</div>
                </div>`;
            toast.onclick = () => {
                cerrarModal("modalVerPerfil");
                mostrarSeccion("mensajes");
                setTimeout(() => abrirConversacion(data.remitenteId, data.nombre, ""), 300);
                toast.remove();
            };
            contenedor.appendChild(toast);
            requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("visible")));
            setTimeout(() => { toast.classList.remove("visible"); setTimeout(() => toast.remove(), 300); }, 6000);

            // Actualizar badge de mensajes
            actualizarBadgeMensajes();
        }
    });

    // Notificación persistente — préstamo próximo a vencer
    hubConexion.on("NotificacionPrestamo", (data) => {
        mostrarNotificacionPersistente({
            id:     `prestamo-${data.prestamoId}`,
            tipo:   data.tipo === "urgente" ? "error" : "warning",
            icono:  data.tipo === "urgente" ? "🚨" : "⏰",
            titulo: data.tipo === "urgente" ? "Préstamo vence pronto" : "Préstamo por vencer",
            texto:  data.mensaje,
            accion: {
                label: "Ver mis préstamos",
                fn:    () => mostrarSeccion("mis-prestamos")
            }
        });
    });

    // Notificación persistente — resolución de solicitud admin
    hubConexion.on("NotificacionSolicitud", (data) => {
        mostrarNotificacionPersistente({
            id:     `solicitud-${Date.now()}`,
            tipo:   data.tipo,
            icono:  data.tipo === "success" ? "⭐" : "❌",
            titulo: "Solicitud de administrador",
            texto:  data.mensaje,
            accion: data.tipo === "success" ? {
                label: "Recargar sesión",
                fn:    () => {
                    mostrarToast("Recarga la página para ver los cambios.", "info", 4000);
                }
            } : null
        });
    });

    // Mensajes leídos por el receptor
    hubConexion.on("MensajesLeidos", () => {
        if (convActivaId) {
            document.querySelectorAll(".burbuja.enviada .burbuja-hora").forEach(el => {
                if (!el.textContent.includes("✓✓")) el.textContent += " ✓✓";
            });
        }
    });

    // Indicador de escritura
    hubConexion.on("UsuarioEscribiendo", (data) => {
        if (convActivaId === data.usuarioId) {
            let ind = document.getElementById("indicadorEscritura");
            if (!ind) {
                ind = document.createElement("div");
                ind.id = "indicadorEscritura";
                ind.className = "indicador-escritura";
                const chatMensajes = document.getElementById("chatMensajes");
                if (chatMensajes) chatMensajes.appendChild(ind);
            }
            ind.innerHTML = `<span>${esc(data.nombre)} está escribiendo<span class="puntos-animados">...</span></span>`;
            scrollChatAbajo();
        }
    });

    hubConexion.on("UsuarioDejoDeEscribir", (data) => {
        if (convActivaId === data.usuarioId) {
            const ind = document.getElementById("indicadorEscritura");
            if (ind) ind.remove();
        }
    });

    // Al conectar, obtener usuarios online y actualizar indicadores
    hubConexion.on("UsuarioConectado", (userId) => {
        usuariosOnline.add(userId);
        actualizarIndicadoresOnline();
    });

    hubConexion.on("UsuarioDesconectado", (userId) => {
        usuariosOnline.delete(userId);
        actualizarIndicadoresOnline();
    });

    try {
        await hubConexion.start();
        // Obtener lista inicial de conectados
        const conectados = await hubConexion.invoke("ObtenerConectados");
        usuariosOnline = new Set(conectados);
        actualizarIndicadoresOnline();
    } catch (e) {
        console.warn("SignalR no disponible:", e);
    }
}

function actualizarIndicadoresOnline() {
    // Actualizar puntos verdes en la lista de conversaciones
    document.querySelectorAll("[data-usuario-id]").forEach(el => {
        const uid  = parseInt(el.dataset.usuarioId);
        const dot  = el.querySelector(".online-dot");
        if (usuariosOnline.has(uid)) {
            if (!dot) {
                const d = document.createElement("div");
                d.className = "online-dot";
                el.style.position = "relative";
                el.appendChild(d);
            }
        } else {
            if (dot) dot.remove();
        }
    });
}

async function desconectarSignalR() {
    if (hubConexion) {
        try { await hubConexion.stop(); } catch {}
        hubConexion = null;
    }
}

// =====================================================
// 8. PANTALLA PRINCIPAL
// =====================================================

function iniciarPantallaPrincipal() {
    document.getElementById("pantallaAuth").style.display      = "none";
    document.getElementById("pantallaPrincipal").style.display = "block";

    const infoUsuario = document.getElementById("infoUsuario");
    infoUsuario.style.display = "flex";

    document.getElementById("nombreUsuarioNav").textContent = usuarioActual.nombre;

    const badgeRol = document.getElementById("badgeRol");
    const esAdminPrincipal = usuarioActual.tipoRol === "Administrador" && usuarioActual.jerarquia === "Principal";
    badgeRol.textContent = esAdminPrincipal ? "Admin Principal" : usuarioActual.tipoRol;
    badgeRol.className   = `usuario-rol`;

    // Foto o inicial en navbar
    actualizarFotoNavbar();

    const esAdmin = usuarioActual.tipoRol === "Administrador";

    // Mostrar/ocultar nav según rol
    ["navItemPrestamos", "navItemUsuarios", "navItemRegistroLibro", "navItemReportes"]
        .forEach(id => document.getElementById(id).style.display = esAdmin ? "block" : "none");

    document.getElementById("navItemSolicitudes").style.display = esAdminPrincipal ? "block" : "none";

    // Ocultar "Solicitar Admin" si ya es admin
    const menuSolAdmin = document.getElementById("menuSolicitarAdmin");
    if (menuSolAdmin) menuSolAdmin.style.display = esAdmin ? "none" : "block";

    // Conectar SignalR
    conectarSignalR();

    // Iniciar polling de mensajes no leídos
    actualizarBadgeMensajes();
    setInterval(actualizarBadgeMensajes, 30000);

    // Badge de solicitudes para Admin Principal
    if (esAdminPrincipal) {
        actualizarBadgeSolicitudes();
        setInterval(actualizarBadgeSolicitudes, 60000);
    }

    mostrarSeccion("inicio");
}

function actualizarFotoNavbar() {
    const btnPerfil = document.getElementById("btnMenuPerfil");
    const fotoNav   = document.getElementById("fotoNavbar");
    const inicialNav = document.getElementById("inicialNavbar");

    if (usuarioActual?.fotoUrl) {
        fotoNav.src             = usuarioActual.fotoUrl;
        fotoNav.style.display   = "block";
        inicialNav.style.display = "none";
    } else {
        inicialNav.textContent   = (usuarioActual?.nombre || "?")[0].toUpperCase();
        inicialNav.style.display = "block";
        fotoNav.style.display    = "none";
    }
}

async function actualizarBadgeMensajes() {
    const res = await apiFetch(`${API_URL}/Mensajes/no-leidos`, { headers: headersAuth() });
    if (!res) return;
    const data = await res.json();
    const badge = document.getElementById("badgeMensajes");
    if (data.success && data.cantidad > 0) {
        badge.textContent    = data.cantidad;
        badge.style.display  = "inline-block";
    } else {
        badge.style.display  = "none";
    }
}

async function actualizarBadgeSolicitudes() {
    const res = await apiFetch(`${API_URL}/Usuarios/solicitudes-admin`, { headers: headersAuth() });
    if (!res) return;
    const data = await res.json();
    const badge = document.getElementById("badgeSolicitudes");
    if (data.success) {
        const pendientes = data.solicitudes.filter(s => s.estado === "Pendiente").length;
        if (pendientes > 0) {
            badge.textContent   = pendientes;
            badge.style.display = "inline-block";
        } else {
            badge.style.display = "none";
        }
    }
}

// =====================================================
// 9. CERRAR SESIÓN
// =====================================================

async function cerrarSesion() {
    await desconectarSignalR();
    tokenJWT            = "";
    usuarioActual       = null;
    prestamoIdPendiente = null;
    convActivaId        = null;

    document.querySelectorAll(".modal.abierto").forEach(m => m.classList.remove("abierto"));
    document.getElementById("menuPerfil").style.display      = "none";
    document.getElementById("loginUsuario").value            = "";
    document.getElementById("loginPassword").value           = "";
    document.getElementById("pantallaPrincipal").style.display = "none";
    document.getElementById("pantallaAuth").style.display      = "flex";
    document.getElementById("infoUsuario").style.display       = "none";

    mostrarFormAuth("login");
}

// =====================================================
// 10. NAVEGACIÓN DE SECCIONES
// =====================================================

function mostrarSeccion(seccion) {
    document.querySelectorAll(".app-nav a").forEach(a => a.classList.remove("activo"));
    const navId = {
        "inicio": "navInicio", "libros": "navLibros",
        "mis-prestamos": "navMisPrestamos", "mensajes": "navMensajes",
        "prestamos": "navPrestamos", "usuarios": "navUsuarios",
        "registro-libro": "navRegistroLibro", "reportes": "navReportes",
        "solicitudes-admin": "navSolicitudes"
    };
    if (navId[seccion]) document.getElementById(navId[seccion])?.classList.add("activo");

    document.getElementById("menuPerfil").style.display = "none";
    convActivaId = null;

    const main = document.getElementById("contenidoPrincipal");
    main.innerHTML = `<div class="empty-state"><div class="empty-state-icono">⏳</div><p>Cargando...</p></div>`;

    const acciones = {
        "inicio":           renderInicio,
        "libros":           renderCatalogo,
        "mis-prestamos":    renderMisPrestamos,
        "mensajes":         renderMensajes,
        "prestamos":        renderPrestamosAdmin,
        "usuarios":         renderUsuariosAdmin,
        "registro-libro":   () => renderFormLibro(),
        "reportes":         renderReportes,
        "solicitudes-admin": renderSolicitudesAdmin,
        "mi-perfil":        renderMiPerfil,
        "solicitar-admin":  renderSolicitarAdmin
    };

    if (acciones[seccion]) acciones[seccion]();
}

function toggleMenuPerfil() {
    const menu = document.getElementById("menuPerfil");
    menu.style.display = menu.style.display === "none" ? "block" : "none";
}

document.addEventListener("click", (e) => {
    // Solo actuar si la pantalla principal está visible
    if (document.getElementById("pantallaPrincipal").style.display === "none") return;
    const wrapper = document.querySelector(".perfil-menu-wrapper");
    if (wrapper && !wrapper.contains(e.target))
        document.getElementById("menuPerfil").style.display = "none";
});

// =====================================================
// 11. INICIO / DASHBOARD
// =====================================================

async function renderInicio() {
    const main    = document.getElementById("contenidoPrincipal");
    const esAdmin = usuarioActual?.tipoRol === "Administrador";

    if (esAdmin) {
        const res = await apiFetch(`${API_URL}/Prestamos/estadisticas`, { headers: headersAuth() });
        if (!res) return;
        const data = await res.json();
        const s    = data.estadisticas;

        main.innerHTML = `
            <div class="seccion-header">
                <div>
                    <div class="seccion-titulo">Dashboard</div>
                    <div class="seccion-subtitulo">Bienvenido, ${esc(usuarioActual.nombre)}</div>
                </div>
            </div>

            ${s.prestamosVencidos > 0 ? `
            <div class="alerta-vencidos">
                <div class="alerta-vencidos-icono">🚨</div>
                <div class="alerta-vencidos-texto">
                    <strong>${s.prestamosVencidos} préstamo(s) vencido(s)</strong>
                    <span>Revisa la sección de Préstamos para gestionar las devoluciones.</span>
                </div>
            </div>` : ""}

            ${s.solicitudesPendientes > 0 && usuarioActual.jerarquia === "Principal" ? `
            <div class="alerta-vencidos" style="border-left-color:var(--accent-warn);background:#fffbeb;">
                <div class="alerta-vencidos-icono">⭐</div>
                <div class="alerta-vencidos-texto">
                    <strong style="color:var(--accent-warn);">${s.solicitudesPendientes} solicitud(es) de administrador pendiente(s)</strong>
                    <span>Revisa la sección de Solicitudes.</span>
                </div>
            </div>` : ""}

            <div class="stats-grid">
                <div class="stat-card"><div class="stat-icono">📚</div><div class="stat-valor">${s.totalLibros}</div><div class="stat-label">Libros en catálogo</div></div>
                <div class="stat-card ${s.librosAgotados > 0 ? "warning" : ""}"><div class="stat-icono">📦</div><div class="stat-valor">${s.librosAgotados}</div><div class="stat-label">Libros agotados</div></div>
                <div class="stat-card"><div class="stat-icono">📄</div><div class="stat-valor">${s.libroConPdf}</div><div class="stat-label">Libros con PDF</div></div>
                <div class="stat-card"><div class="stat-icono">🔖</div><div class="stat-valor">${s.prestamosActivos}</div><div class="stat-label">Préstamos activos</div></div>
                <div class="stat-card ${s.prestamosVencidos > 0 ? "alerta" : ""}"><div class="stat-icono">⏰</div><div class="stat-valor">${s.prestamosVencidos}</div><div class="stat-label">Vencidos</div></div>
                <div class="stat-card success"><div class="stat-icono">✅</div><div class="stat-valor">${s.prestamosDevueltos}</div><div class="stat-label">Devueltos</div></div>
                <div class="stat-card"><div class="stat-icono">👥</div><div class="stat-valor">${s.totalUsuarios}</div><div class="stat-label">Usuarios</div></div>
                <div class="stat-card ${s.solicitudesPendientes > 0 ? "warning" : ""}"><div class="stat-icono">⭐</div><div class="stat-valor">${s.solicitudesPendientes}</div><div class="stat-label">Solicitudes pendientes</div></div>
            </div>

            ${s.librosMasSolicitados?.length > 0 ? `
            <div class="seccion-titulo" style="margin-bottom:14px;font-size:17px;">📈 Top 5 libros más solicitados</div>
            <div class="tabla-contenedor">
                <table><thead><tr><th>#</th><th>Título</th><th>Préstamos</th></tr></thead>
                <tbody>${s.librosMasSolicitados.map((l, i) => `
                    <tr><td class="td-muted">${i+1}</td><td>${esc(l.titulo)}</td>
                    <td><span class="badge badge-activo">${l.prestamos}</span></td></tr>`).join("")}
                </tbody></table>
            </div>` : ""}`;
    } else {
        const res = await apiFetch(`${API_URL}/Prestamos/mis-prestamos`, { headers: headersAuth() });
        let activos = 0, vencidos = 0;
        if (res) {
            const data = await res.json();
            if (data.success) {
                activos  = data.prestamos.filter(p => p.estado === "Activo").length;
                vencidos = data.prestamos.filter(p => p.vencido).length;
            }
        }

        main.innerHTML = `
            <div class="seccion-header">
                <div>
                    <div class="seccion-titulo">Bienvenido, ${esc(usuarioActual.nombre)}</div>
                    <div class="seccion-subtitulo">${esc(usuarioActual.tipoRol)} — ${esc(usuarioActual.correo)}</div>
                </div>
            </div>

            ${vencidos > 0 ? `
            <div class="alerta-vencidos">
                <div class="alerta-vencidos-icono">⚠️</div>
                <div class="alerta-vencidos-texto">
                    <strong>Tienes ${vencidos} préstamo(s) vencido(s)</strong>
                    <span>Devuelve los libros para evitar sanciones.</span>
                </div>
            </div>` : ""}

            <div class="stats-grid">
                <div class="stat-card"><div class="stat-icono">🔖</div><div class="stat-valor">${activos}</div><div class="stat-label">Préstamos activos</div></div>
                <div class="stat-card ${vencidos > 0 ? "alerta" : ""}"><div class="stat-icono">⏰</div><div class="stat-valor">${vencidos}</div><div class="stat-label">Vencidos</div></div>
            </div>

            <div class="seccion-titulo" style="margin-bottom:14px;">Accesos rápidos</div>
            <div class="accesos-grid">
                <a class="acceso-card" href="#" onclick="mostrarSeccion('libros')"><div class="acceso-icono">📖</div><div class="acceso-texto">Ver catálogo</div></a>
                <a class="acceso-card" href="#" onclick="mostrarSeccion('mis-prestamos')"><div class="acceso-icono">🔖</div><div class="acceso-texto">Mis préstamos</div></a>
                <a class="acceso-card" href="#" onclick="mostrarSeccion('mensajes')"><div class="acceso-icono">💬</div><div class="acceso-texto">Mensajes</div></a>
            </div>`;
    }
}

// =====================================================
// 12. CATÁLOGO
// =====================================================

async function renderCatalogo() {
    const main = document.getElementById("contenidoPrincipal");

    const [resLibros, resCats] = await Promise.all([
        apiFetch(`${API_URL}/Libros`, { headers: headersAuth() }),
        apiFetch(`${API_URL}/Libros/categorias/lista`, { headers: headersAuth() })
    ]);

    if (!resLibros || !resCats) return;
    const dataLibros = await resLibros.json();
    const dataCats   = await resCats.json();
    if (!dataLibros.success) { mostrarToast("Error al cargar el catálogo.", "error"); return; }

    const categorias = dataCats.success ? dataCats.categorias : [];
    const libros     = dataLibros.libros;

    main.innerHTML = `
        <div class="seccion-header">
            <div><div class="seccion-titulo">Catálogo de Libros</div>
            <div class="seccion-subtitulo">${libros.length} título(s)</div></div>
        </div>
        <div class="filtros-bar">
            <input type="text" id="filtroBusqueda" placeholder="🔍 Buscar por título, autor o ISBN..."
                   oninput="filtrarLibros()">
            <select id="filtroCategoria" onchange="filtrarLibros()">
                <option value="">Todas las categorías</option>
                ${categorias.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
            </select>
            <select id="filtroDisponibilidad" onchange="filtrarLibros()">
                <option value="">Todos</option>
                <option value="disponible">Solo disponibles</option>
                <option value="agotado">Solo agotados</option>
            </select>
        </div>
        <div id="librosGrid" class="libros-grid"></div>`;

    main.dataset.libros = JSON.stringify(libros);
    window._librosData  = libros;
    filtrarLibros();
}

function filtrarLibros() {
    const main           = document.getElementById("contenidoPrincipal");
    const libros         = JSON.parse(main.dataset.libros || "[]");
    const busqueda       = normalizar(document.getElementById("filtroBusqueda")?.value ?? "");
    const categoria      = document.getElementById("filtroCategoria")?.value ?? "";
    const disponibilidad = document.getElementById("filtroDisponibilidad")?.value ?? "";

    window._librosData = libros;
    const filtrados = libros.filter(l => {
        const coincideBusqueda = !busqueda ||
            normalizar(l.titulo).includes(busqueda)    ||
            normalizar(l.autor).includes(busqueda)     ||
            normalizar(l.isbn).includes(busqueda)      ||
            normalizar(l.categoria).includes(busqueda);
        const coincideCategoria      = !categoria || l.categoria === categoria;
        const coincideDisponibilidad = !disponibilidad ||
            (disponibilidad === "disponible" && l.disponible) ||
            (disponibilidad === "agotado"    && !l.disponible);
        return coincideBusqueda && coincideCategoria && coincideDisponibilidad;
    });

    renderLibrosGrid(filtrados);
}

// Mapa global para acceder a datos de libros desde el popover
const _librosCache = {};

function renderLibrosGrid(libros) {
    const grid = document.getElementById("librosGrid");
    if (!grid) return;

    if (libros.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
            <div class="empty-state-icono">📭</div><h3>Sin resultados</h3>
            <p>No se encontraron libros con esos filtros.</p></div>`;
        return;
    }

    libros.forEach(l => { _librosCache[l.id] = l; });
    grid.innerHTML = libros.map(l => {
        const imgSrc = l.imagen || "";
        const imgHtml = `<div class="libro-card-imagen">
            <img src="${imgSrc || 'img/libro-placeholder.png'}" alt="${esc(l.titulo)}"
                 onerror="this.src='img/libro-placeholder.png'">
        </div>`;

        return `
        <div class="libro-card">
            ${imgHtml}
            <div class="libro-card-body">
                <div class="libro-titulo">${esc(l.titulo)}</div>
                <div class="libro-autor">${esc(l.autor)}</div>
                <span class="libro-categoria">${esc(l.categoria)}</span>
                ${l.sinopsis ? `<div class="libro-sinopsis">${esc(l.sinopsis)}</div>` : ""}
                ${l.tienePdf ? `<span class="libro-pdf-badge">📄 PDF disponible</span>` : ""}
                <div class="libro-stock">
                    ${l.disponible
                        ? `<span class="stock-disponible">✓ ${l.cantidad} disponible(s)</span>`
                        : `<span class="stock-agotado">✗ Agotado</span>`}
                </div>
            </div>
            <div class="libro-card-footer">
                <button class="btn-ver-mas" onclick="verDetalleLibro(${l.id})">
                    Ver más
                </button>
                <button class="btn-solicitar" ${!l.disponible ? "disabled" : ""}
                    onclick="solicitarPrestamo(${l.id}, \'${esc(l.titulo).replace(/\'/g,"\\\'")}\')")>
                    ${l.disponible ? "📖 Solicitar préstamo" : "Agotado"}
                </button>
                ${usuarioActual?.tipoRol === "Administrador" ? `
                <div style="display:flex;gap:6px;margin-top:6px;">
                    <button class="btn-secundario" style="flex:1;font-size:12px;"
                        onclick="editarLibroCatalogo(${l.id})">✏️ Editar</button>
                    <button class="btn-peligro" style="flex:1;font-size:12px;"
                        onclick="eliminarLibroCatalogo(${l.id}, \'${esc(l.titulo).replace(/\'/g,"\\\'")}\')")>🗑️ Eliminar</button>
                </div>` : ""}
            </div>
        </div>`;
    }).join("");
}

// =====================================================
// 13. SOLICITAR PRÉSTAMO
// =====================================================

async function solicitarPrestamo(libroId) {
    const res = await apiFetch(`${API_URL}/Prestamos/solicitar`, {
        method: "POST", headers: headersAuth(),
        body: JSON.stringify({ libroId })
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error.", "error"); return; }
    mostrarToast(`Préstamo registrado. Ref: ${data.referencia}. ${data.message}`, "success", 6000);
    renderCatalogo();
}

// =====================================================
// 14. MIS PRÉSTAMOS
// =====================================================

async function renderMisPrestamos() {
    const main = document.getElementById("contenidoPrincipal");
    const res  = await apiFetch(`${API_URL}/Prestamos/mis-prestamos`, { headers: headersAuth() });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast("Error al cargar préstamos.", "error"); return; }

    const activos  = data.prestamos.filter(p => p.estado === "Activo");
    const historial = data.prestamos.filter(p => p.estado !== "Activo");

    main.innerHTML = `
        <div class="seccion-header">
            <div><div class="seccion-titulo">Mis Préstamos</div>
            <div class="seccion-subtitulo">${activos.length} activo(s) · ${historial.length} devuelto(s)</div></div>
        </div>

        ${activos.length > 0 ? `
        <div class="seccion-titulo" style="font-size:16px;margin-bottom:12px;">📖 Activos</div>
        <div class="tabla-contenedor" style="margin-bottom:28px;">
            <table><thead><tr><th>Libro</th><th>Referencia</th><th>Devolver antes de</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>${activos.map(p => `
                <tr>
                    <td><strong>${esc(p.libro.titulo)}</strong><div class="td-muted">${esc(p.libro.autor)}</div></td>
                    <td class="td-muted">${esc(p.referencia)}</td>
                    <td><span style="color:${p.vencido ? "var(--accent-alert)" : "var(--accent-success)"};font-weight:600;">
                        ${formatearFecha(p.fechaDevolucion)}</span></td>
                    <td>${p.vencido
                        ? `<span class="badge badge-vencido">Vencido</span>`
                        : `<span class="badge badge-activo">Activo</span>`}</td>
                    <td style="display:flex;gap:6px;flex-wrap:wrap;">
                        <button class="btn-accion"
                            onclick="abrirConfirmDevolucion(${p.id}, '${esc(p.libro.titulo).replace(/'/g,"\\'")}')">
                            Devolver
                        </button>
                        ${p.libro.tienePdf ? `
                        <button class="btn-ver-pdf" onclick="abrirPdf(${p.id}, '${esc(p.libro.titulo).replace(/'/g,"\\'")}')">
                            📄 Ver PDF
                        </button>` : ""}
                    </td>
                </tr>`).join("")}
            </tbody></table>
        </div>` : `
        <div class="empty-state" style="padding:40px 0;">
            <div class="empty-state-icono">📭</div><h3>Sin préstamos activos</h3>
            <p>Ve al catálogo para solicitar un libro.</p>
        </div>`}

        ${historial.length > 0 ? `
        <div class="seccion-titulo" style="font-size:16px;margin-bottom:12px;">📋 Historial</div>
        <div class="tabla-contenedor">
            <table><thead><tr><th>Libro</th><th>Referencia</th><th>Fecha préstamo</th><th>Devolución</th><th>Estado</th></tr></thead>
            <tbody>${historial.map(p => `
                <tr>
                    <td><strong>${esc(p.libro.titulo)}</strong></td>
                    <td class="td-muted">${esc(p.referencia)}</td>
                    <td class="td-muted">${formatearFecha(p.fechaPrestamo)}</td>
                    <td class="td-muted">${formatearFecha(p.fechaDevolucion)}</td>
                    <td><span class="badge badge-devuelto">Devuelto</span></td>
                </tr>`).join("")}
            </tbody></table>
        </div>` : ""}`;
}

// =====================================================
// 15. DEVOLUCIÓN Y PDF
// =====================================================

function abrirConfirmDevolucion(id, titulo) {
    prestamoIdPendiente = id;
    document.getElementById("textoConfirmDevolucion").textContent = `¿Confirmas la devolución de "${titulo}"?`;
    abrirModal("modalConfirmarDevolucion");
}

async function confirmarDevolucion() {
    if (!prestamoIdPendiente) return;
    cerrarModal("modalConfirmarDevolucion");
    const idDevuelto = prestamoIdPendiente;
    const res = await apiFetch(`${API_URL}/Prestamos/devolver/${idDevuelto}`, {
        method: "PUT", headers: headersAuth()
    });
    prestamoIdPendiente = null;
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error.", "error"); return; }
    mostrarToast(`Devolución registrada: "${data.libro}"`, "success");
    // Cerrar notificación persistente de ese préstamo si existe
    cerrarNotificacionPersistente(`prestamo-${idDevuelto}`);
    renderMisPrestamos();
}

async function abrirPdf(prestamoId, titulo) {
    const res = await apiFetch(`${API_URL}/Prestamos/pdf/${prestamoId}`, {
        headers: headersAuth()
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast("Error al cargar el PDF.", "error"); return; }
    window.open(data.pdfUrl, "_blank");
}

function cerrarModalPdf() {
    const iframe = document.getElementById("pdfViewer");
    // Liberar blob URL si existe para evitar memory leaks
    if (iframe.src && iframe.src.startsWith("blob:")) {
        URL.revokeObjectURL(iframe.src);
    }
    iframe.src = "";
    cerrarModal("modalPdf");
}

// =====================================================
// 16. MENSAJERÍA
// =====================================================

async function renderMensajes() {
    const main = document.getElementById("contenidoPrincipal");

    const [resConvs, resUsuarios] = await Promise.all([
        apiFetch(`${API_URL}/Mensajes/conversaciones`, { headers: headersAuth() }),
        apiFetch(`${API_URL}/Usuarios`, { headers: headersAuth() })
    ]);

    if (!resConvs || !resUsuarios) return;
    const dataConvs    = await resConvs.json();
    const dataUsuarios = await resUsuarios.json();

    const conversaciones = dataConvs.success    ? dataConvs.conversaciones    : [];
    const usuarios       = dataUsuarios.success ? dataUsuarios.usuarios : [];

    main.innerHTML = `
        <div class="mensajes-layout">
            <div class="mensajes-sidebar" id="mensajesSidebar">
                <div class="mensajes-sidebar-header">💬 Mensajes</div>
                <div class="mensajes-busqueda">
                    <input type="text" id="buscarUsuario" placeholder="🔍 Buscar usuario..."
                           oninput="filtrarUsuariosMensajes()">
                </div>
                <div class="lista-conversaciones" id="listaConversaciones">
                    ${renderListaConversaciones(conversaciones)}
                </div>
            </div>
            <div class="mensajes-chat" id="mensajesChat">
                <div class="chat-vacio">
                    <div class="chat-vacio-icono">💬</div>
                    <p>Selecciona una conversación o busca un usuario para chatear</p>
                </div>
            </div>
        </div>`;

    // Guardar usuarios para búsqueda
    main.dataset.usuarios = JSON.stringify(usuarios);
    main.dataset.conversaciones = JSON.stringify(conversaciones);
}

function renderListaConversaciones(conversaciones) {
    if (conversaciones.length === 0)
        return `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">
            Sin conversaciones. Busca un usuario para comenzar.</div>`;

    return conversaciones.map(c => {
        const u       = c.usuario;
        const ult     = c.ultimoMensaje;
        // Limpiar prefijos de oculto antes de mostrar el preview
        const limpiarContenido = (texto) => texto?.replace(/^\[OCULTO:\d+\]/, "") || "";
        const preview = ult ? (ult.esMio ? `Tú: ${limpiarContenido(ult.contenido)}` : limpiarContenido(ult.contenido)) : "Sin mensajes";
        const hora    = ult ? formatearHora(ult.fechaEnvio) : "";
        const fotoHtml = u.fotoUrl
            ? `<img src="${esc(u.fotoUrl)}" class="foto-perfil-card" style="position:relative;">`
            : `<div class="inicial-perfil-card">${esc((u.nombre||"?")[0].toUpperCase())}</div>`;

        return `
        <div class="conv-item" id="conv-${u.id}"
             onclick="abrirConversacion(${u.id}, '${esc(u.nombre).replace(/'/g,"\\'")}', '${esc(u.fotoUrl || "")}')">
            <div style="position:relative;" data-usuario-id="${u.id}">
                ${fotoHtml}
                ${usuariosOnline.has(u.id) ? '<div class="online-dot"></div>' : ""}
            </div>
            <div class="conv-info">
                <div class="conv-nombre">${esc(u.nombre)}</div>
                <div class="conv-preview">${esc(preview.substring(0, 50))}</div>
            </div>
            <div class="conv-meta">
                <div class="conv-hora">${hora}</div>
                ${c.noLeidos > 0 ? `<div class="conv-badge">${c.noLeidos}</div>` : ""}
            </div>
        </div>`;
    }).join("");
}

function filtrarUsuariosMensajes() {
    const main    = document.getElementById("contenidoPrincipal");
    const q       = normalizar(document.getElementById("buscarUsuario")?.value ?? "");
    const usuarios = JSON.parse(main.dataset.usuarios || "[]");
    const convs    = JSON.parse(main.dataset.conversaciones || "[]");
    const lista    = document.getElementById("listaConversaciones");
    if (!lista) return;

    if (!q) { lista.innerHTML = renderListaConversaciones(convs); return; }

    const filtrados = usuarios
        .filter(u => u.id !== usuarioActual.id && normalizar(u.nombre).includes(q))
        .map(u => ({
            usuario:       u,
            ultimoMensaje: null,
            noLeidos:      0
        }));

    if (filtrados.length === 0) {
        lista.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">
            Sin usuarios encontrados.</div>`;
        return;
    }

    lista.innerHTML = filtrados.map(c => {
        const u = c.usuario;
        const fotoHtml = u.fotoUrl
            ? `<img src="${esc(u.fotoUrl)}" class="foto-perfil-card">`
            : `<div class="inicial-perfil-card">${esc((u.nombre||"?")[0].toUpperCase())}</div>`;
        return `
        <div class="conv-item" onclick="abrirConversacion(${u.id}, '${esc(u.nombre).replace(/'/g,"\\'")}', '${esc(u.fotoUrl||"")}')">
            ${fotoHtml}
            <div class="conv-info">
                <div class="conv-nombre">${esc(u.nombre)}</div>
                <div class="conv-preview td-muted">${esc(u.tipoRol)}</div>
            </div>
        </div>`;
    }).join("");
}

async function abrirConversacion(otroId, otroNombre, otraFoto) {
    convActivaId    = otroId;
    convActivaNombre = otroNombre;

    // Marcar item activo en sidebar
    document.querySelectorAll(".conv-item").forEach(el => el.classList.remove("activa"));
    document.getElementById(`conv-${otroId}`)?.classList.add("activa");

    // Unirse al grupo de conversación en SignalR
    if (hubConexion?.state === "Connected")
        await hubConexion.invoke("UnirseConversacion", otroId).catch(() => {});

    const chat = document.getElementById("mensajesChat");
    const fotoHtml = otraFoto
        ? `<img src="${esc(otraFoto)}" class="foto-perfil-card">`
        : `<div class="inicial-perfil-card">${esc((otroNombre||"?")[0].toUpperCase())}</div>`;

    chat.innerHTML = `
        <div class="chat-header">
            <div style="cursor:pointer;" onclick="verPerfilUsuario(${otroId})">${fotoHtml}</div>
            <div class="chat-header-info" style="flex:1;">
                <h3 style="cursor:pointer;" onclick="verPerfilUsuario(${otroId})">${esc(otroNombre)}</h3>
                <p id="estadoConversacion" style="display:flex;align-items:center;gap:5px;">
                    ${usuariosOnline.has(otroId)
                        ? '<span style="width:8px;height:8px;border-radius:50%;background:#48bb78;display:inline-block;"></span><span style="color:#276749;font-size:12px;">En línea</span>'
                        : '<span style="font-size:12px;color:var(--text-muted);">Cargando...</span>'}
                </p>
            </div>
            <button class="btn-icon" title="Eliminar conversación"
                onclick="eliminarConversacion(${otroId})"
                style="color:var(--accent-alert);flex-shrink:0;">🗑️</button>
        </div>
        <div class="chat-mensajes" id="chatMensajes"></div>
        <div class="chat-input-area">
            <textarea id="chatInput" placeholder="Escribe un mensaje..."
                      onkeydown="manejarEnterChat(event)"
                      oninput="manejarEscribiendo()"></textarea>
            <button class="btn-enviar" onclick="enviarMensaje()">➤</button>
        </div>`;

    await cargarMensajesConversacion(otroId, true);
    actualizarBadgeMensajes();
}

async function cargarMensajesConversacion(otroId, scrollAbajo = true) {
    const res = await apiFetch(`${API_URL}/Mensajes/conversacion/${otroId}`, { headers: headersAuth() });
    if (!res) return;
    const data = await res.json();
    if (!data.success) return;

    const estadoEl = document.getElementById("estadoConversacion");
    if (estadoEl) estadoEl.textContent = data.otroUsuario.tipoRol;

    const chatMensajes = document.getElementById("chatMensajes");
    if (!chatMensajes) return;

    if (data.mensajes.length === 0) {
        chatMensajes.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px;">
            Sé el primero en enviar un mensaje.</div>`;
        return;
    }

    chatMensajes.innerHTML = data.mensajes.map(m => `
        <div class="burbuja-wrapper ${m.esMio ? "mia" : ""}" id="msg-${m.id}">
            <div class="burbuja ${m.esMio ? "enviada" : "recibida"}">
                <div class="burbuja-contenido" id="contenido-${m.id}">${esc(m.contenido)}</div>
                <span class="burbuja-hora">${formatearHora(m.fechaEnvio)}</span>
                <div class="burbuja-acciones">
                    ${m.esMio ? `<button class="btn-burbuja" onclick="editarMensaje(${m.id})" title="Editar">✏️</button>` : ""}
                    <button class="btn-burbuja" onclick="eliminarMensaje(${m.id}, ${!m.esMio})" title="${m.esMio ? "Eliminar" : "Eliminar para mí"}">🗑️</button>
                </div>
            </div>
        </div>`).join("");

    if (scrollAbajo) scrollChatAbajo();
}

function scrollChatAbajo() {
    const chat = document.getElementById("chatMensajes");
    if (chat) setTimeout(() => { chat.scrollTop = chat.scrollHeight; }, 50);
}

function manejarEnterChat(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        enviarMensaje();
    }
}

function manejarEscribiendo() {
    if (!hubConexion || hubConexion.state !== "Connected" || !convActivaId) return;
    hubConexion.invoke("Escribiendo", convActivaId, usuarioActual.nombre).catch(() => {});
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        hubConexion.invoke("DejoDeEscribir", convActivaId).catch(() => {});
    }, 2000);
}

async function enviarMensaje() {
    const input     = document.getElementById("chatInput");
    const contenido = input?.value.trim();
    if (!contenido || !convActivaId) return;

    input.value = "";
    // Detener indicador de escritura
    if (hubConexion?.state === "Connected")
        hubConexion.invoke("DejoDeEscribir", convActivaId).catch(() => {});

    const res = await apiFetch(`${API_URL}/Mensajes`, {
        method: "POST", headers: headersAuth(),
        body: JSON.stringify({ receptorId: convActivaId, contenido })
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error al enviar.", "error"); return; }

    await cargarMensajesConversacion(convActivaId, true);
}

// =====================================================
// 17. VER PERFIL DE USUARIO
// =====================================================

async function verPerfilUsuario(id) {
    const res = await apiFetch(`${API_URL}/Usuarios/${id}/perfil`, { headers: headersAuth() });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast("Error al cargar perfil.", "error"); return; }

    const u = data.usuario;
    const esAdminPrincipal = u.tipoRol === "Administrador" && u.jerarquia === "Principal";
    const rolMostrado = esAdminPrincipal ? "Administrador Principal" : u.tipoRol;

    document.getElementById("contenidoModalPerfil").innerHTML = `
        <div style="text-align:center;padding:8px 0 24px;">
            ${renderFotoPerfil(u.fotoUrl, u.nombre, true)}
            <h2 style="font-size:20px;font-weight:700;color:var(--primary);margin-bottom:4px;">${esc(u.nombre)}</h2>
            <span class="badge badge-${esc(u.tipoRol.toLowerCase())}">${esc(rolMostrado)}</span>
            <p style="font-size:12px;color:var(--text-muted);margin-top:8px;">
                Miembro desde ${formatearFecha(u.fechaRegistro)}
            </p>
        </div>
        ${u.descripcion ? `
        <div class="perfil-descripcion">${esc(u.descripcion)}</div>` : ""}
        <div style="display:flex;justify-content:center;margin-top:8px;">
            <button class="btn-accion" onclick="cerrarModal('modalVerPerfil');mostrarSeccion('mensajes');
                setTimeout(()=>abrirConversacion(${u.id},'${esc(u.nombre).replace(/'/g,"\\'")}','${esc(u.fotoUrl||"")}'),300)">
                💬 Enviar mensaje
            </button>
        </div>`;

    abrirModal("modalVerPerfil");
}

// =====================================================
// 18. MI PERFIL — EDITAR
// =====================================================

async function renderMiPerfil() {
    const main = document.getElementById("contenidoPrincipal");

    main.innerHTML = `
        <div class="seccion-header">
            <div><div class="seccion-titulo">Mi Perfil</div>
            <div class="seccion-subtitulo">Actualiza tu foto y descripción personal.</div></div>
        </div>
        <div class="perfil-card">
            <div class="perfil-header-card">
                <div id="fotoPerfilPreview">
                    ${renderFotoPerfil(usuarioActual.fotoUrl, usuarioActual.nombre, true)}
                </div>
                <div class="perfil-info">
                    <h2>${esc(usuarioActual.nombre)}</h2>
                    <p>${esc(usuarioActual.cedula)} · ${esc(usuarioActual.correo)}</p>
                    <p style="margin-top:4px;">
                        <span class="badge badge-${esc(usuarioActual.tipoRol.toLowerCase())}">${esc(usuarioActual.tipoRol)}</span>
                    </p>
                </div>
            </div>

            <div class="form-grupo">
                <label>Foto de perfil</label>
                <label class="btn-upload-foto" for="inputFotoPerfil">
                    📷 Seleccionar foto (JPG, PNG, WebP — máx. 2 MB)
                </label>
                <input type="file" id="inputFotoPerfil" accept=".jpg,.jpeg,.png,.webp"
                       style="display:none;" onchange="previsualizarFoto(event)">
                <div id="previewFotoNueva"></div>
                <button id="btnSubirFoto" style="display:none;" onclick="subirFotoPerfil()">
                    Guardar foto
                </button>

                <label style="margin-top:12px;">Descripción personal</label>
                <textarea id="inputDescripcion" rows="4"
                          placeholder="Cuéntanos algo sobre ti...">${esc(usuarioActual.descripcion || "")}</textarea>
                <button onclick="guardarDescripcion()">Guardar descripción</button>

                ${usuarioActual.fotoUrl ? `
                <button class="btn-peligro" style="margin-top:8px;" onclick="eliminarFotoPerfil()">
                    🗑️ Eliminar foto actual
                </button>` : ""}
            </div>
        </div>`;
}

function previsualizarFoto(event) {
    const archivo = event.target.files[0];
    if (!archivo) return;
    const url = URL.createObjectURL(archivo);
    document.getElementById("previewFotoNueva").innerHTML =
        `<img src="${url}" class="preview-imagen" alt="Preview">`;
    document.getElementById("btnSubirFoto").style.display = "block";
}

async function subirFotoPerfil() {
    const input = document.getElementById("inputFotoPerfil");
    if (!input.files[0]) return;

    const formData = new FormData();
    formData.append("foto", input.files[0]);

    const res = await apiFetch(`${API_URL}/Usuarios/foto`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${tokenJWT}` },
        body: formData
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error al subir foto.", "error"); return; }

    usuarioActual.fotoUrl = data.fotoUrl;
    actualizarFotoNavbar();
    mostrarToast("Foto de perfil actualizada.", "success");
    renderMiPerfil();
}

async function guardarDescripcion() {
    const descripcion = document.getElementById("inputDescripcion").value.trim();
    const res = await apiFetch(`${API_URL}/Usuarios/perfil`, {
        method: "PUT", headers: headersAuth(),
        body: JSON.stringify({ descripcion })
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error.", "error"); return; }
    usuarioActual.descripcion = descripcion;
    mostrarToast("Descripción actualizada.", "success");
}

async function eliminarFotoPerfil() {
    const res = await apiFetch(`${API_URL}/Usuarios/foto`, {
        method: "DELETE", headers: headersAuth()
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error.", "error"); return; }
    usuarioActual.fotoUrl = "";
    actualizarFotoNavbar();
    mostrarToast("Foto eliminada.", "success");
    renderMiPerfil();
}

// =====================================================
// 19. CAMBIAR CONTRASEÑA
// =====================================================

function abrirModalCambiarPassword() {
    document.getElementById("menuPerfil").style.display = "none";
    ["cpActual","cpNueva","cpConfirm"].forEach(id => document.getElementById(id).value = "");
    abrirModal("modalCambiarPassword");
}

async function cambiarPassword() {
    const passwordActual = document.getElementById("cpActual").value;
    const nuevaPassword  = document.getElementById("cpNueva").value;
    const confirmar      = document.getElementById("cpConfirm").value;

    if (!passwordActual || !nuevaPassword) { mostrarToast("Completa todos los campos.", "warning"); return; }
    if (nuevaPassword !== confirmar) { mostrarToast("Las contraseñas no coinciden.", "warning"); return; }
    if (nuevaPassword.length < 6) { mostrarToast("Mínimo 6 caracteres.", "warning"); return; }

    const res = await apiFetch(`${API_URL}/Usuarios/cambiar-password`, {
        method: "POST", headers: headersAuth(),
        body: JSON.stringify({ passwordActual, nuevaPassword })
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error.", "error"); return; }

    cerrarModal("modalCambiarPassword");
    mostrarToast("Contraseña actualizada.", "success");
}

// =====================================================
// 20. ELIMINAR CUENTA
// =====================================================

function confirmarEliminarCuenta() {
    document.getElementById("menuPerfil").style.display = "none";
    abrirModal("modalConfirmarEliminar");
}

async function eliminarCuenta() {
    cerrarModal("modalConfirmarEliminar");
    const res = await apiFetch(`${API_URL}/Usuarios/${usuarioActual.id}`, {
        method: "DELETE", headers: headersAuth()
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error.", "error"); return; }
    mostrarToast("Cuenta eliminada. Hasta luego.", "info", 4000);
    setTimeout(cerrarSesion, 1500);
}

// =====================================================
// 21. SOLICITAR SER ADMIN
// =====================================================

async function renderSolicitarAdmin() {
    const main = document.getElementById("contenidoPrincipal");

    main.innerHTML = `
        <div class="seccion-header">
            <div><div class="seccion-titulo">Solicitar Privilegios de Administrador</div>
            <div class="seccion-subtitulo">Tu solicitud será revisada por el Administrador Principal.</div></div>
        </div>
        <div class="form-card">
            <div class="form-grupo">
                <label>Motivo de la solicitud (opcional)</label>
                <textarea id="motivoSolicitud" rows="4"
                    placeholder="Explica brevemente por qué necesitas privilegios de administrador..."></textarea>
                <button onclick="enviarSolicitudAdmin()">⭐ Enviar solicitud</button>
            </div>
        </div>`;
}

async function enviarSolicitudAdmin() {
    const mensaje = document.getElementById("motivoSolicitud").value.trim();
    const res = await apiFetch(`${API_URL}/Usuarios/solicitar-admin`, {
        method: "POST", headers: headersAuth(),
        body: JSON.stringify({ mensaje })
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error.", "error"); return; }
    mostrarToast("Solicitud enviada al Administrador Principal.", "success");
    mostrarSeccion("inicio");
}

// =====================================================
// 22. ADMIN — GESTIÓN DE PRÉSTAMOS
// =====================================================

async function renderPrestamosAdmin() {
    if (usuarioActual?.tipoRol !== "Administrador") return;
    const main = document.getElementById("contenidoPrincipal");
    const res  = await apiFetch(`${API_URL}/Prestamos/activos`, { headers: headersAuth() });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast("Error al cargar préstamos.", "error"); return; }

    const prestamos = data.prestamos;
    const vencidos  = prestamos.filter(p => p.vencido).length;

    main.innerHTML = `
        <div class="seccion-header">
            <div><div class="seccion-titulo">Gestión de Préstamos</div>
            <div class="seccion-subtitulo">${prestamos.length} activo(s)
                ${vencidos > 0 ? `· <span style="color:var(--accent-alert)">${vencidos} vencido(s)</span>` : ""}
            </div></div>
        </div>
        ${prestamos.length === 0 ? `
        <div class="empty-state"><div class="empty-state-icono">✅</div>
        <h3>Sin préstamos activos</h3><p>Todos los libros han sido devueltos.</p></div>` : `
        <div class="tabla-contenedor">
            <table><thead><tr><th>Usuario</th><th>Libro</th><th>Referencia</th><th>Devolver antes de</th><th>Estado</th><th>Acción</th></tr></thead>
            <tbody>${prestamos.map(p => `
                <tr>
                    <td>
                        <div style="display:flex;align-items:center;gap:8px;">
                            ${p.usuario.fotoUrl
                                ? `<img src="${esc(p.usuario.fotoUrl)}" class="foto-perfil-card" style="width:32px;height:32px;">`
                                : `<div class="inicial-perfil-card" style="width:32px;height:32px;font-size:13px;">${esc(p.usuario.nombre[0])}</div>`}
                            <div><strong>${esc(p.usuario.nombre)}</strong><div class="td-muted">${esc(p.usuario.cedula)}</div></div>
                        </div>
                    </td>
                    <td>${esc(p.libro.titulo)}</td>
                    <td class="td-muted">${esc(p.referencia)}</td>
                    <td><span style="color:${p.vencido ? "var(--accent-alert)" : "inherit"};font-weight:${p.vencido ? "700" : "400"}">
                        ${formatearFecha(p.fechaDevolucion)}</span></td>
                    <td>${p.vencido ? `<span class="badge badge-vencido">Vencido</span>` : `<span class="badge badge-activo">Activo</span>`}</td>
                    <td><button class="btn-accion"
                        onclick="abrirConfirmDevolucion(${p.id}, '${esc(p.libro.titulo).replace(/'/g,"\\'")}')">
                        Devolver</button></td>
                </tr>`).join("")}
            </tbody></table>
        </div>`}`;
}

// =====================================================
// 23. ADMIN — GESTIÓN DE USUARIOS
// =====================================================

async function renderUsuariosAdmin() {
    if (usuarioActual?.tipoRol !== "Administrador") return;
    const main = document.getElementById("contenidoPrincipal");
    const res  = await apiFetch(`${API_URL}/Usuarios`, { headers: headersAuth() });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast("Error al cargar usuarios.", "error"); return; }

    const esAdminPrincipal = usuarioActual.jerarquia === "Principal";

    main.innerHTML = `
        <div class="seccion-header">
            <div><div class="seccion-titulo">Gestión de Usuarios</div>
            <div class="seccion-subtitulo">${data.usuarios.length} registrado(s)</div></div>
        </div>
        <div class="filtros-bar" style="margin-bottom:18px;">
            <input type="text" id="filtroUsuarios" placeholder="🔍 Buscar por nombre, cédula o correo..."
                   oninput="filtrarTablaUsuarios()">
        </div>
        <div class="tabla-contenedor">
            <table><thead><tr><th>Usuario</th><th>Cédula</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Registro</th><th>Acciones</th></tr></thead>
            <tbody id="tablaUsuariosCuerpo">${renderFilasUsuarios(data.usuarios, esAdminPrincipal)}</tbody>
            </table>
        </div>`;

    document.getElementById("contenidoPrincipal").dataset.usuarios         = JSON.stringify(data.usuarios);
    document.getElementById("contenidoPrincipal").dataset.esAdminPrincipal = esAdminPrincipal ? "1" : "0";
}

function renderFilasUsuarios(usuarios, esAdminPrincipal) {
    if (usuarios.length === 0)
        return `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted);">Sin resultados</td></tr>`;

    return usuarios.map(u => {
        const esPrincipal   = u.jerarquia === "Principal";
        const rolMostrado   = esPrincipal ? "Admin Principal" : u.tipoRol;
        const badgeClass    = esPrincipal ? "badge-admin" : `badge-${u.tipoRol.toLowerCase()}`;

        return `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:8px;">
                    ${u.fotoUrl
                        ? `<img src="${esc(u.fotoUrl)}" class="foto-perfil-card" style="width:36px;height:36px;">`
                        : `<div class="inicial-perfil-card" style="width:36px;height:36px;font-size:14px;">${esc(u.nombre[0])}</div>`}
                    <strong>${esc(u.nombre)}</strong>
                </div>
            </td>
            <td class="td-muted">${esc(u.cedula)}</td>
            <td class="td-muted">${esc(u.correo)}</td>
            <td><span class="badge ${badgeClass}">${esc(rolMostrado)}</span></td>
            <td><span class="badge badge-${esc(u.estado.toLowerCase())}">${esc(u.estado)}</span></td>
            <td class="td-muted">${formatearFecha(u.fechaRegistro)}</td>
            <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    ${(esPrincipal || u.id === usuarioActual?.id) ? '<span class="td-muted" style="font-size:12px;">—</span>' : `
                        ${u.estado !== "Activo"     ? `<button class="btn-accion" style="font-size:12px;" onclick="cambiarEstadoUsuario(${u.id},'Activo')">✅ Activar</button>` : ""}
                        ${u.estado !== "Sancionado" ? `<button class="btn-icon" title="Sancionar" onclick="cambiarEstadoUsuario(${u.id},'Sancionado')">⚠️</button>` : ""}
                        ${u.estado !== "Inactivo"   ? `<button class="btn-icon" title="Inactivar" onclick="cambiarEstadoUsuario(${u.id},'Inactivo')">🚫</button>` : ""}
                        ${esAdminPrincipal && u.tipoRol !== "Administrador" ? `<button class="btn-icon" title="Hacer Admin" onclick="cambiarRolUsuario(${u.id},'Administrador')">⭐</button>` : ""}
                        ${esAdminPrincipal && u.tipoRol === "Administrador" ? `<button class="btn-icon" title="Revocar Admin" onclick="cambiarRolUsuario(${u.id},'Estudiante')">↩</button>` : ""}
                    `}
                </div>
            </td>
        </tr>`;
    }).join("");
}

function filtrarTablaUsuarios() {
    const main     = document.getElementById("contenidoPrincipal");
    const usuarios  = JSON.parse(main.dataset.usuarios || "[]");
    const esAP      = main.dataset.esAdminPrincipal === "1";
    const q         = normalizar(document.getElementById("filtroUsuarios")?.value ?? "");
    const filtrados = usuarios.filter(u =>
        normalizar(u.nombre).includes(q) ||
        normalizar(u.cedula).includes(q) ||
        normalizar(u.correo).includes(q));
    const tbody = document.getElementById("tablaUsuariosCuerpo");
    if (tbody) tbody.innerHTML = renderFilasUsuarios(filtrados, esAP);
}

async function cambiarEstadoUsuario(id, estado) {
    const res = await apiFetch(`${API_URL}/Usuarios/${id}/estado`, {
        method: "PUT", headers: headersAuth(), body: JSON.stringify({ estado })
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error.", "error"); return; }
    mostrarToast(data.message, "success");
    renderUsuariosAdmin();
}

async function cambiarRolUsuario(id, tipoRol) {
    const res = await apiFetch(`${API_URL}/Usuarios/${id}/rol`, {
        method: "PUT", headers: headersAuth(), body: JSON.stringify({ tipoRol })
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error.", "error"); return; }
    mostrarToast(data.message, "success");
    renderUsuariosAdmin();
}

// =====================================================
// 24. ADMIN — REGISTRAR Y EDITAR LIBRO
// =====================================================

function renderFormLibro(libroEditar = null) {
    if (usuarioActual?.tipoRol !== "Administrador") return;
    const main    = document.getElementById("contenidoPrincipal");
    const esEditar = libroEditar !== null;

    main.innerHTML = `
        <div class="seccion-header">
            <div><div class="seccion-titulo">${esEditar ? "Editar Libro" : "Registrar Libro"}</div>
            <div class="seccion-subtitulo">${esEditar ? "Modifica los datos del libro." : "Agrega un nuevo título al catálogo."}</div></div>
        </div>
        <div class="form-card">
            <div class="form-grupo">
                <div class="form-grid-2">
                    <div class="full-width">
                        <label>Título *</label>
                        <input type="text" id="libroTitulo" value="${esc(libroEditar?.titulo ?? "")}" placeholder="Título completo">
                    </div>
                    <div>
                        <label>Autor *</label>
                        <input type="text" id="libroAutor" value="${esc(libroEditar?.autor ?? "")}" placeholder="Nombre del autor">
                    </div>
                    <div>
                        <label>ISBN *</label>
                        <input type="text" id="libroIsbn" value="${esc(libroEditar?.isbn ?? "")}" placeholder="978-X-XXXX-XXXX-X">
                    </div>
                    <div>
                        <label>Editorial</label>
                        <input type="text" id="libroEditorial" value="${esc(libroEditar?.editorial ?? "")}" placeholder="Editorial">
                    </div>
                    <div>
                        <label>Año</label>
                        <input type="number" id="libroAnio" value="${libroEditar?.anio ?? ""}" placeholder="2024" min="1400" max="2100">
                    </div>
                    <div>
                        <label>Categoría *</label>
                        <input type="text" id="libroCategoria" value="${esc(libroEditar?.categoria ?? "")}" placeholder="Ej: Matemáticas">
                    </div>
                    <div>
                        <label>Cantidad *</label>
                        <input type="number" id="libroCantidad" value="${libroEditar?.cantidad ?? 1}" min="0" max="9999">
                    </div>
                    <div class="full-width">
                        <label>Sinopsis</label>
                        <textarea id="libroSinopsis" rows="3" placeholder="Descripción breve del libro...">${esc(libroEditar?.sinopsis ?? "")}</textarea>
                    </div>
                </div>
                <button onclick="guardarLibro(${esEditar ? libroEditar.id : "null"})">
                    ${esEditar ? "💾 Guardar cambios" : "➕ Registrar libro"}
                </button>
            </div>

            ${esEditar ? `
            <div style="margin-top:28px;border-top:1px solid var(--border);padding-top:20px;">
                <div class="seccion-titulo" style="font-size:16px;margin-bottom:16px;">📷 Portada del libro</div>
                ${libroEditar.imagen ? `<img src="${esc(libroEditar.imagen)}" class="preview-imagen" style="margin-bottom:12px;">` : ""}
                <div class="form-grupo">
                    <label class="btn-upload-foto" for="inputPortada">📷 Seleccionar portada (JPG, PNG — máx. 5 MB)</label>
                    <input type="file" id="inputPortada" accept=".jpg,.jpeg,.png,.webp"
                           style="display:none;" onchange="previsualizarPortada(event)">
                    <div id="previewPortada"></div>
                    <button id="btnSubirPortada" style="display:none;" onclick="subirPortada(${libroEditar.id})">Guardar portada</button>
                    ${libroEditar.imagen ? `<button class="btn-peligro" onclick="eliminarPortada(${libroEditar.id})">🗑️ Eliminar portada</button>` : ""}
                </div>
            </div>

            <div style="margin-top:20px;border-top:1px solid var(--border);padding-top:20px;">
                <div class="seccion-titulo" style="font-size:16px;margin-bottom:16px;">📄 PDF del libro</div>
                ${libroEditar.tienePdf
                    ? `<p style="color:var(--accent-success);font-size:13px;margin-bottom:10px;">✓ Este libro tiene un PDF cargado.</p>`
                    : `<p style="color:var(--text-muted);font-size:13px;margin-bottom:10px;">Sin PDF cargado.</p>`}
                <div class="form-grupo">
                    <label class="btn-upload-foto" for="inputPdf">📄 Seleccionar PDF (máx. 50 MB)</label>
                    <input type="file" id="inputPdf" accept=".pdf" style="display:none;"
                           onchange="document.getElementById('btnSubirPdf').style.display='block'">
                    <button id="btnSubirPdf" style="display:none;" onclick="subirPdf(${libroEditar.id})">Guardar PDF</button>
                    ${libroEditar.tienePdf ? `<button class="btn-peligro" onclick="eliminarPdf(${libroEditar.id})">🗑️ Eliminar PDF</button>` : ""}
                </div>
            </div>` : ""}
        </div>`;
}

async function guardarLibro(libroId = null) {
    const titulo    = document.getElementById("libroTitulo").value.trim();
    const autor     = document.getElementById("libroAutor").value.trim();
    const isbn      = document.getElementById("libroIsbn").value.trim();
    const editorial = document.getElementById("libroEditorial").value.trim();
    const anio      = parseInt(document.getElementById("libroAnio").value) || 0;
    const categoria = document.getElementById("libroCategoria").value.trim();
    const cantidad  = parseInt(document.getElementById("libroCantidad").value) || 0;
    const sinopsis  = document.getElementById("libroSinopsis").value.trim();

    if (!titulo || !autor || !isbn || !categoria) {
        mostrarToast("Completa los campos obligatorios (*).", "warning"); return;
    }

    const esEditar = libroId !== null && libroId !== "null";
    const url      = esEditar ? `${API_URL}/Libros/${libroId}` : `${API_URL}/Libros`;
    const metodo   = esEditar ? "PUT" : "POST";

    const res = await apiFetch(url, {
        method: metodo, headers: headersAuth(),
        body: JSON.stringify({ titulo, autor, isbn, editorial, anio, categoria, cantidad, sinopsis })
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error.", "error"); return; }

    mostrarToast(esEditar ? "Libro actualizado." : "Libro registrado. Ahora puedes agregar portada y PDF.", "success");

    if (!esEditar && data.id) {
        // Ir a editar el libro recién creado para subir portada/PDF
        const resLibro = await apiFetch(`${API_URL}/Libros/${data.id}`, { headers: headersAuth() });
        if (resLibro) {
            const dLibro = await resLibro.json();
            if (dLibro.success) renderFormLibro(dLibro.libro);
        }
    }
}

function previsualizarPortada(event) {
    const archivo = event.target.files[0];
    if (!archivo) return;
    const url = URL.createObjectURL(archivo);
    document.getElementById("previewPortada").innerHTML =
        `<img src="${url}" class="preview-imagen" alt="Preview portada">`;
    document.getElementById("btnSubirPortada").style.display = "block";
}

async function subirPortada(libroId) {
    const input = document.getElementById("inputPortada");
    if (!input.files[0]) return;
    const formData = new FormData();
    formData.append("imagen", input.files[0]);

    const res = await apiFetch(`${API_URL}/Libros/${libroId}/portada`, {
        method: "POST", headers: { "Authorization": `Bearer ${tokenJWT}` }, body: formData
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error.", "error"); return; }
    mostrarToast("Portada actualizada.", "success");

    const resLibro = await apiFetch(`${API_URL}/Libros/${libroId}`, { headers: headersAuth() });
    if (resLibro) { const d = await resLibro.json(); if (d.success) renderFormLibro(d.libro); }
}

async function eliminarPortada(libroId) {
    const res = await apiFetch(`${API_URL}/Libros/${libroId}/portada`, {
        method: "DELETE", headers: headersAuth()
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error.", "error"); return; }
    mostrarToast("Portada eliminada.", "success");
    const resLibro = await apiFetch(`${API_URL}/Libros/${libroId}`, { headers: headersAuth() });
    if (resLibro) { const d = await resLibro.json(); if (d.success) renderFormLibro(d.libro); }
}

function mostrarOverlayPdf() {
    let overlay = document.getElementById("overlaySubidaPdf");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "overlaySubidaPdf";
        overlay.style.cssText = `
            position:fixed; bottom:24px; right:24px; z-index:9998;
            background:#fff; border:1px solid var(--border);
            border-radius:14px; padding:20px 24px; min-width:300px;
            box-shadow:0 8px 32px rgba(0,0,0,0.18);
            animation: modalEntrar 0.2s ease;`;
        overlay.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                <span style="font-size:22px;">📄</span>
                <div>
                    <div style="font-size:14px;font-weight:700;color:var(--primary);">Subiendo PDF</div>
                    <div id="overlayPdfNombre" style="font-size:12px;color:var(--text-muted);"></div>
                </div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <span id="overlayPdfEstado" style="font-size:12px;color:var(--text-muted);">Iniciando...</span>
                <span id="overlayPdfPct" style="font-size:13px;font-weight:800;color:var(--secondary);">0%</span>
            </div>
            <div style="height:10px;background:var(--border);border-radius:20px;overflow:hidden;">
                <div id="overlayPdfBarra" style="height:100%;width:0%;background:var(--secondary);border-radius:20px;transition:width 0.25s ease;"></div>
            </div>
            <div id="overlayPdfMb" style="font-size:11px;color:var(--text-light);margin-top:6px;text-align:right;"></div>`;
        document.body.appendChild(overlay);
    }
    return overlay;
}

function ocultarOverlayPdf() {
    const overlay = document.getElementById("overlaySubidaPdf");
    if (overlay) {
        overlay.style.opacity = "0";
        overlay.style.transition = "opacity 0.3s";
        setTimeout(() => overlay.remove(), 300);
    }
}

async function subirPdf(libroId) {
    const input = document.getElementById("inputPdf");
    if (!input.files[0]) return;

    const archivo = input.files[0];
    const formData = new FormData();
    formData.append("pdf", archivo);

    const btnSubir = document.getElementById("btnSubirPdf");
    if (btnSubir) btnSubir.disabled = true;

    // Mostrar ventana flotante
    const overlay = mostrarOverlayPdf();
    const nombreEl  = document.getElementById("overlayPdfNombre");
    const estadoEl  = document.getElementById("overlayPdfEstado");
    const pctEl     = document.getElementById("overlayPdfPct");
    const barraEl   = document.getElementById("overlayPdfBarra");
    const mbEl      = document.getElementById("overlayPdfMb");

    if (nombreEl) nombreEl.textContent = archivo.name;

    // 1. Obtener firma del servidor
    const resFirma = await apiFetch(`${API_URL}/Libros/${libroId}/pdf-signature`, {
        headers: headersAuth()
    });
    if (!resFirma) { ocultarOverlayPdf(); if (btnSubir) btnSubir.disabled = false; return; }
    const firma = await resFirma.json();
    if (!firma.success) { mostrarToast(firma.message || "Error al obtener firma.", "error"); ocultarOverlayPdf(); if (btnSubir) btnSubir.disabled = false; return; }

    // Sanitizar nombre del archivo
    let nombreLimpio = archivo.name.replace(/\.pdf$/i, "");
    nombreLimpio = nombreLimpio.normalize("NFD").replace(/[̀-ͯ]/g, "");
    nombreLimpio = nombreLimpio.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^_+|_+$/g, "");

    // 2. Construir FormData para Cloudinary directamente
    // Solo los parámetros que coinciden con la firma (folder + timestamp)
    const cloudFormData = new FormData();
    cloudFormData.append("file",      archivo);
    cloudFormData.append("api_key",   firma.apiKey);
    cloudFormData.append("timestamp", firma.timestamp);
    cloudFormData.append("signature", firma.firma);
    cloudFormData.append("folder",    firma.folder);

    // 3. Subir directo a Cloudinary con progreso real
    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
                const pct        = Math.round((e.loaded / e.total) * 100);
                const mbCargados = (e.loaded / 1024 / 1024).toFixed(1);
                const mbTotal    = (e.total  / 1024 / 1024).toFixed(1);

                if (barraEl) barraEl.style.width = `${pct}%`;
                if (pctEl)   pctEl.textContent   = `${pct}%`;
                if (mbEl)    mbEl.textContent     = `${mbCargados} MB de ${mbTotal} MB`;

                if (pct < 100) {
                    if (estadoEl) estadoEl.textContent = "Subiendo a Cloudinary...";
                } else {
                    if (estadoEl) estadoEl.textContent = "Procesando...";
                    if (barraEl)  barraEl.style.background = "var(--accent-success)";
                    if (pctEl)    pctEl.style.color = "var(--accent-success)";
                }
            }
        });

        xhr.addEventListener("load", async () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const resultado = JSON.parse(xhr.responseText);
                    const secureUrl = resultado.secure_url;
                    const publicId  = resultado.public_id;

                    // 4. Confirmar al servidor la URL y publicId
                    const resConfirmar = await apiFetch(`${API_URL}/Libros/${libroId}/pdf-confirmar`, {
                        method: "POST", headers: headersAuth(),
                        body: JSON.stringify({ secureUrl, publicId })
                    });
                    if (resConfirmar) {
                        const conf = await resConfirmar.json();
                        if (conf.success) {
                            ocultarOverlayPdf();
                            mostrarToast("PDF subido correctamente.", "success");
                            const resLibro = await apiFetch(`${API_URL}/Libros/${libroId}`, { headers: headersAuth() });
                            if (resLibro) { const d = await resLibro.json(); if (d.success) renderFormLibro(d.libro); }
                        } else {
                            mostrarToast(conf.message || "Error al confirmar PDF.", "error");
                        }
                    }
                } catch {
                    mostrarToast("Error al procesar respuesta de Cloudinary.", "error");
                }
            } else {
                try {
                    const err = JSON.parse(xhr.responseText);
                    mostrarToast(`Error Cloudinary: ${err.error?.message || "Intenta de nuevo."}`, "error");
                } catch {
                    mostrarToast("Error al subir el PDF.", "error");
                }
            }
            ocultarOverlayPdf();
            if (btnSubir) btnSubir.disabled = false;
            resolve();
        });

        xhr.addEventListener("error", () => {
            mostrarToast("Error de conexión al subir el PDF.", "error");
            ocultarOverlayPdf();
            if (btnSubir) btnSubir.disabled = false;
            resolve();
        });

        // Subir directo a Cloudinary — URL según resource_type raw
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${firma.cloudName}/raw/upload`);
        xhr.send(cloudFormData);
    });
}

async function eliminarPdf(libroId) {
    const res = await apiFetch(`${API_URL}/Libros/${libroId}/pdf`, {
        method: "DELETE", headers: headersAuth()
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error.", "error"); return; }
    mostrarToast("PDF eliminado.", "success");
    const resLibro = await apiFetch(`${API_URL}/Libros/${libroId}`, { headers: headersAuth() });
    if (resLibro) { const d = await resLibro.json(); if (d.success) renderFormLibro(d.libro); }
}

// =====================================================
// 25. SOLICITUDES DE ADMIN (Admin Principal)
// =====================================================

async function renderSolicitudesAdmin() {
    if (usuarioActual?.jerarquia !== "Principal") return;
    const main = document.getElementById("contenidoPrincipal");
    const res  = await apiFetch(`${API_URL}/Usuarios/solicitudes-admin`, { headers: headersAuth() });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast("Error al cargar solicitudes.", "error"); return; }

    const pendientes = data.solicitudes.filter(s => s.estado === "Pendiente");
    const resueltas  = data.solicitudes.filter(s => s.estado !== "Pendiente");

    main.innerHTML = `
        <div class="seccion-header">
            <div><div class="seccion-titulo">Solicitudes de Administrador</div>
            <div class="seccion-subtitulo">${pendientes.length} pendiente(s) · ${resueltas.length} resuelta(s)</div></div>
        </div>

        ${pendientes.length > 0 ? `
        <div class="seccion-titulo" style="font-size:16px;margin-bottom:14px;">⏳ Pendientes</div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:28px;">
            ${pendientes.map(s => `
            <div class="solicitud-card">
                <div>
                    ${s.usuario.fotoUrl
                        ? `<img src="${esc(s.usuario.fotoUrl)}" class="foto-perfil-card">`
                        : `<div class="inicial-perfil-card">${esc(s.usuario.nombre[0])}</div>`}
                </div>
                <div class="solicitud-info">
                    <div class="solicitud-nombre">${esc(s.usuario.nombre)}</div>
                    <div class="td-muted" style="font-size:12px;">${esc(s.usuario.cedula)} · ${esc(s.usuario.tipoRol)}</div>
                    ${s.mensaje ? `<div class="solicitud-mensaje">"${esc(s.mensaje)}"</div>` : ""}
                    <div class="solicitud-fecha">${formatearFechaHora(s.fechaSolicitud)}</div>
                </div>
                <div class="solicitud-acciones">
                    <button class="btn-accion" onclick="resolverSolicitud(${s.id},'Aprobada')">✅ Aprobar</button>
                    <button class="btn-peligro" onclick="resolverSolicitud(${s.id},'Rechazada')">❌ Rechazar</button>
                </div>
            </div>`).join("")}
        </div>` : `
        <div class="empty-state" style="padding:40px 0;">
            <div class="empty-state-icono">✅</div>
            <h3>Sin solicitudes pendientes</h3>
        </div>`}

        ${resueltas.length > 0 ? `
        <div class="seccion-titulo" style="font-size:16px;margin-bottom:14px;">📋 Historial</div>
        <div class="tabla-contenedor">
            <table><thead><tr><th>Usuario</th><th>Estado</th><th>Fecha solicitud</th><th>Fecha resolución</th></tr></thead>
            <tbody>${resueltas.map(s => `
                <tr>
                    <td><strong>${esc(s.usuario.nombre)}</strong></td>
                    <td><span class="badge badge-${esc(s.estado.toLowerCase())}">${esc(s.estado)}</span></td>
                    <td class="td-muted">${formatearFecha(s.fechaSolicitud)}</td>
                    <td class="td-muted">${formatearFecha(s.fechaResolucion)}</td>
                </tr>`).join("")}
            </tbody></table>
        </div>` : ""}`;
}

async function resolverSolicitud(id, estado) {
    const res = await apiFetch(`${API_URL}/Usuarios/solicitudes-admin/${id}`, {
        method: "PUT", headers: headersAuth(), body: JSON.stringify({ estado })
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error.", "error"); return; }
    mostrarToast(data.message, "success");
    actualizarBadgeSolicitudes();
    renderSolicitudesAdmin();
}

// =====================================================
// 26. REPORTES
// =====================================================

async function renderReportes() {
    if (usuarioActual?.tipoRol !== "Administrador") return;
    const main = document.getElementById("contenidoPrincipal");
    main.innerHTML = `
        <div class="seccion-header">
            <div><div class="seccion-titulo">Reportes</div>
            <div class="seccion-subtitulo">Consulta información del sistema.</div></div>
        </div>
        <div class="reportes-grid">
            <button class="reporte-btn" onclick="cargarReporte('disponibles')"><span class="reporte-btn-icono">📚</span>Libros Disponibles</button>
            <button class="reporte-btn" onclick="cargarReporte('activos')"><span class="reporte-btn-icono">🔖</span>Préstamos Activos</button>
            <button class="reporte-btn" onclick="cargarReporte('historial')"><span class="reporte-btn-icono">📋</span>Historial de Préstamos</button>
            <button class="reporte-btn" onclick="cargarReporte('estadisticas')"><span class="reporte-btn-icono">📊</span>Estadísticas Generales</button>
        </div>
        <div class="reportes-filtros" id="filtrosFecha" style="display:none;">
            <div><label>Desde</label><input type="date" id="reporteDesde"></div>
            <div><label>Hasta</label><input type="date" id="reporteHasta"></div>
            <button class="btn-accion" onclick="cargarReporte('historial')">Filtrar</button>
        </div>
        <div id="resultadoReporte"></div>`;
}

async function cargarReporte(tipo) {
    const contenedor = document.getElementById("resultadoReporte");
    const filtros    = document.getElementById("filtrosFecha");
    if (!contenedor) return;

    contenedor.innerHTML = `<div class="empty-state"><div class="empty-state-icono">⏳</div><p>Cargando reporte...</p></div>`;

    if (tipo === "historial") {
        if (filtros) filtros.style.display = "flex";
        const desde = document.getElementById("reporteDesde")?.value;
        const hasta = document.getElementById("reporteHasta")?.value;
        let url = `${API_URL}/Prestamos/historial`;
        const params = [];
        if (desde) params.push(`desde=${desde}`);
        if (hasta) params.push(`hasta=${hasta}`);
        if (params.length) url += `?${params.join("&")}`;

        const res = await apiFetch(url, { headers: headersAuth() });
        if (!res) return;
        const data = await res.json();

        if (!data.success || data.historial.length === 0) {
            contenedor.innerHTML = `<div class="empty-state"><div class="empty-state-icono">📭</div><h3>Sin registros</h3></div>`;
            return;
        }
        contenedor.innerHTML = `<div class="tabla-contenedor"><table>
            <thead><tr><th>Usuario</th><th>Libro</th><th>Referencia</th><th>Fecha</th><th>Estado</th></tr></thead>
            <tbody>${data.historial.map(p => `
                <tr>
                    <td>${esc(p.usuario.nombre)}<div class="td-muted">${esc(p.usuario.cedula)}</div></td>
                    <td>${esc(p.libro.titulo)}</td>
                    <td class="td-muted">${esc(p.referencia)}</td>
                    <td class="td-muted">${formatearFechaHora(p.fechaPrestamo)}</td>
                    <td><span class="badge badge-${esc(p.estado.toLowerCase())}">${esc(p.estado)}</span></td>
                </tr>`).join("")}
            </tbody></table></div>`;
        return;
    }

    if (filtros) filtros.style.display = "none";

    if (tipo === "disponibles") {
        const res = await apiFetch(`${API_URL}/Libros`, { headers: headersAuth() });
        if (!res) return;
        const data = await res.json();
        const disponibles = data.libros.filter(l => l.disponible);
        contenedor.innerHTML = `<div class="tabla-contenedor"><table>
            <thead><tr><th>Título</th><th>Autor</th><th>Categoría</th><th>Stock</th><th>PDF</th><th>Editar</th></tr></thead>
            <tbody>${disponibles.map(l => `
                <tr>
                    <td>${esc(l.titulo)}</td>
                    <td class="td-muted">${esc(l.autor)}</td>
                    <td><span class="libro-categoria">${esc(l.categoria)}</span></td>
                    <td><span class="stock-disponible">${l.cantidad}</span></td>
                    <td>${l.tienePdf ? "✅" : "—"}</td>
                    <td><button class="btn-icon" onclick="renderFormLibro(${JSON.stringify(l).replace(/"/g,'&quot;')})">✏️</button></td>
                </tr>`).join("")}
            </tbody></table></div>`;
        return;
    }

    if (tipo === "activos") {
        const res = await apiFetch(`${API_URL}/Prestamos/activos`, { headers: headersAuth() });
        if (!res) return;
        const data = await res.json();
        contenedor.innerHTML = `<div class="tabla-contenedor"><table>
            <thead><tr><th>Usuario</th><th>Libro</th><th>Referencia</th><th>Devolver antes de</th><th>Estado</th></tr></thead>
            <tbody>${data.prestamos.map(p => `
                <tr>
                    <td>${esc(p.usuario.nombre)}</td>
                    <td>${esc(p.libro.titulo)}</td>
                    <td class="td-muted">${esc(p.referencia)}</td>
                    <td style="color:${p.vencido ? "var(--accent-alert)" : "inherit"};font-weight:${p.vencido ? "700" : "400"}">
                        ${formatearFecha(p.fechaDevolucion)}</td>
                    <td><span class="badge badge-${p.vencido ? "vencido" : "activo"}">${p.vencido ? "Vencido" : "Activo"}</span></td>
                </tr>`).join("")}
            </tbody></table></div>`;
        return;
    }

    if (tipo === "estadisticas") {
        const res = await apiFetch(`${API_URL}/Prestamos/estadisticas`, { headers: headersAuth() });
        if (!res) return;
        const data = await res.json();
        const s    = data.estadisticas;
        contenedor.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card"><div class="stat-icono">📚</div><div class="stat-valor">${s.totalLibros}</div><div class="stat-label">Total libros</div></div>
                <div class="stat-card warning"><div class="stat-icono">📦</div><div class="stat-valor">${s.librosAgotados}</div><div class="stat-label">Agotados</div></div>
                <div class="stat-card"><div class="stat-icono">📄</div><div class="stat-valor">${s.libroConPdf}</div><div class="stat-label">Con PDF</div></div>
                <div class="stat-card"><div class="stat-icono">🔖</div><div class="stat-valor">${s.totalPrestamos}</div><div class="stat-label">Total préstamos</div></div>
                <div class="stat-card"><div class="stat-icono">📖</div><div class="stat-valor">${s.prestamosActivos}</div><div class="stat-label">Activos</div></div>
                <div class="stat-card alerta"><div class="stat-icono">⏰</div><div class="stat-valor">${s.prestamosVencidos}</div><div class="stat-label">Vencidos</div></div>
                <div class="stat-card success"><div class="stat-icono">✅</div><div class="stat-valor">${s.prestamosDevueltos}</div><div class="stat-label">Devueltos</div></div>
                <div class="stat-card"><div class="stat-icono">👥</div><div class="stat-valor">${s.totalUsuarios}</div><div class="stat-label">Usuarios</div></div>
            </div>
            ${s.librosMasSolicitados?.length > 0 ? `
            <div class="seccion-titulo" style="margin:20px 0 12px;font-size:16px;">📈 Top 5 más solicitados</div>
            <div class="tabla-contenedor"><table>
                <thead><tr><th>#</th><th>Título</th><th>Préstamos</th></tr></thead>
                <tbody>${s.librosMasSolicitados.map((l, i) => `
                    <tr><td class="td-muted">${i+1}</td><td>${esc(l.titulo)}</td>
                    <td><span class="badge badge-activo">${l.prestamos}</span></td></tr>`).join("")}
                </tbody></table></div>` : ""}`;
    }
}

// =====================================================
// ADMIN — EDITAR Y ELIMINAR LIBRO DESDE EL CATÁLOGO
// =====================================================

async function editarLibroCatalogo(libroId) {
    const res = await apiFetch(`${API_URL}/Libros/${libroId}`, { headers: headersAuth() });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast("Error al cargar el libro.", "error"); return; }
    renderFormLibro(data.libro);
    // Marcar nav activo
    document.querySelectorAll(".app-nav a").forEach(a => a.classList.remove("activo"));
    document.getElementById("navRegistroLibro")?.classList.add("activo");
}

async function eliminarLibroCatalogo(libroId, titulo) {
    if (!confirm(`¿Eliminar "${titulo}"? Esta acción no se puede deshacer.`)) return;

    const res = await apiFetch(`${API_URL}/Libros/${libroId}`, {
        method: "DELETE", headers: headersAuth()
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error al eliminar.", "error"); return; }
    mostrarToast("Libro eliminado correctamente.", "success");
    renderCatalogo();
}

// =====================================================
// EDITAR Y ELIMINAR MENSAJES
// =====================================================

function editarMensaje(id) {
    const contenidoEl = document.getElementById(`contenido-${id}`);
    if (!contenidoEl) return;

    const textoActual = contenidoEl.textContent;

    // Reemplazar el contenido por un input editable
    const wrapper = contenidoEl.parentElement;
    contenidoEl.outerHTML = `
        <div id="editar-${id}" style="display:flex;flex-direction:column;gap:6px;">
            <textarea id="input-editar-${id}" style="padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.3);background:rgba(255,255,255,0.15);color:#fff;font-size:13px;resize:none;min-height:60px;font-family:var(--font);">${textoActual}</textarea>
            <div style="display:flex;gap:6px;justify-content:flex-end;">
                <button class="btn-burbuja" onclick="cancelarEdicion(${id}, '${textoActual.replace(/'/g, "\\'")}')" style="font-size:12px;">✕ Cancelar</button>
                <button class="btn-burbuja" onclick="guardarEdicion(${id})" style="font-size:12px;background:rgba(255,255,255,0.2);">✓ Guardar</button>
            </div>
        </div>`;

    // Ocultar botones de acción mientras se edita
    const acciones = wrapper.querySelector(".burbuja-acciones");
    if (acciones) acciones.style.display = "none";

    document.getElementById(`input-editar-${id}`)?.focus();
}

function cancelarEdicion(id, textoOriginal) {
    const editarEl = document.getElementById(`editar-${id}`);
    if (!editarEl) return;

    editarEl.outerHTML = `<div class="burbuja-contenido" id="contenido-${id}">${textoOriginal}</div>`;

    const wrapper = document.querySelector(`#msg-${id} .burbuja`);
    const acciones = wrapper?.querySelector(".burbuja-acciones");
    if (acciones) acciones.style.display = "";
}

async function guardarEdicion(id) {
    const input = document.getElementById(`input-editar-${id}`);
    if (!input) return;

    const nuevoContenido = input.value.trim();
    if (!nuevoContenido) { mostrarToast("El mensaje no puede estar vacío.", "warning"); return; }

    const res = await apiFetch(`${API_URL}/Mensajes/${id}`, {
        method: "PUT",
        headers: headersAuth(),
        body: JSON.stringify({ contenido: nuevoContenido })
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error al editar.", "error"); return; }

    // Actualizar el contenido en pantalla sin recargar todo
    const editarEl = document.getElementById(`editar-${id}`);
    if (editarEl) {
        editarEl.outerHTML = `<div class="burbuja-contenido" id="contenido-${id}">${esc(nuevoContenido)}</div>`;
        const wrapper = document.querySelector(`#msg-${id} .burbuja`);
        const acciones = wrapper?.querySelector(".burbuja-acciones");
        if (acciones) acciones.style.display = "";
    }

    mostrarToast("Mensaje editado.", "success", 2000);
}

async function eliminarMensaje(id, soloParaMi = false) {
    const url = `${API_URL}/Mensajes/${id}${soloParaMi ? "?soloParaMi=true" : ""}`;
    const res = await apiFetch(url, { method: "DELETE", headers: headersAuth() });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error al eliminar.", "error"); return; }

    const burbuja = document.getElementById(`msg-${id}`);
    if (burbuja) {
        burbuja.style.opacity = "0";
        burbuja.style.transition = "opacity 0.2s";
        setTimeout(() => burbuja.remove(), 200);
    }

    mostrarToast(soloParaMi ? "Mensaje eliminado para ti." : "Mensaje eliminado.", "info", 2000);
}

async function eliminarConversacion(otroId) {
    if (!confirm("¿Eliminar toda esta conversación? Solo se eliminará para ti.")) return;

    const res = await apiFetch(`${API_URL}/Mensajes/conversacion/${otroId}`, {
        method: "DELETE", headers: headersAuth()
    });
    if (!res) return;
    const data = await res.json();
    if (!data.success) { mostrarToast(data.message || "Error.", "error"); return; }

    mostrarToast("Conversación eliminada.", "info", 2000);
    // Volver al inbox
    convActivaId = null;
    mostrarSeccion("mensajes");
}

// =====================================================
// POPOVER DETALLE DE LIBRO
// =====================================================

function verDetalleLibro(libroId) {
    const libros = window._librosData || [];
    const libro  = libros.find(l => l.id === libroId);
    if (!libro) { mostrarToast("No se encontró el libro.", "error"); return; }

    const popover   = document.getElementById("popoverLibro");
    const contenido = document.getElementById("popoverLibroContenido");

    contenido.innerHTML = `
        <div class="libro-card-imagen" style="height:140px;margin-bottom:12px;border-radius:8px;overflow:hidden;">
            <img src="${libro.imagen || 'img/libro-placeholder.png'}" alt="${esc(libro.titulo)}"
                 onerror="this.src='img/libro-placeholder.png'" style="max-height:130px;">
        </div>
        <div style="font-size:15px;font-weight:700;color:var(--primary);margin-bottom:4px;line-height:1.3;">
            ${esc(libro.titulo)}
        </div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">
            ${esc(libro.autor)}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
            <span class="libro-categoria">${esc(libro.categoria)}</span>
            ${libro.tienePdf ? '<span class="libro-pdf-badge">📄 PDF</span>' : ""}
        </div>
        ${libro.editorial || libro.anio ? `
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">
            ${[libro.editorial, libro.anio].filter(Boolean).map(v => esc(String(v))).join(" · ")}
        </div>` : ""}
        ${libro.isbn ? `
        <div style="font-size:11px;color:var(--text-light);margin-bottom:8px;">ISBN: ${esc(libro.isbn)}</div>` : ""}
        ${libro.sinopsis ? `
        <div style="font-size:13px;color:var(--text-main);line-height:1.5;margin-bottom:12px;
            max-height:120px;overflow-y:auto;padding-right:4px;">
            ${esc(libro.sinopsis)}
        </div>` : ""}
        <div style="display:flex;justify-content:space-between;align-items:center;
            border-top:1px solid var(--border);padding-top:10px;">
            <span class="${libro.disponible ? 'stock-disponible' : 'stock-agotado'}" style="font-size:13px;">
                ${libro.disponible ? "✓ " + libro.cantidad + " disponible(s)" : "✗ Agotado"}
            </span>
            <button class="btn-solicitar" style="width:auto;padding:7px 14px;font-size:13px;"
                ${!libro.disponible ? "disabled" : ""}
                onclick="cerrarPopoverLibro();solicitarPrestamo(${libro.id})">
                📖 Solicitar
            </button>
        </div>`;

    // Mostrar overlay y modal centrado
    const ov = document.getElementById("popoverLibroOverlay");
    if (ov) ov.style.display = "block";
    popover.style.display = "flex";
}

function cerrarPopoverLibro() {
    document.getElementById("popoverLibro").style.display = "none";
    const ov = document.getElementById("popoverLibroOverlay");
    if (ov) ov.style.display = "none";
}

// =====================================================
// NOTIFICACIONES PERSISTENTES
// Se muestran en la esquina superior derecha
// y no desaparecen hasta que el usuario las cierra
// =====================================================

function mostrarNotificacionPersistente({ id, tipo, icono, titulo, texto, accion }) {
    // Evitar duplicados
    if (document.getElementById(`notif-${id}`)) return;

    let contenedor = document.getElementById("notifPersistentesContenedor");
    if (!contenedor) {
        contenedor = document.createElement("div");
        contenedor.id = "notifPersistentesContenedor";
        contenedor.style.cssText = `
            position:fixed; top:70px; right:20px; z-index:9000;
            display:flex; flex-direction:column; gap:10px;
            max-width:360px; width:calc(100% - 40px);`;
        document.body.appendChild(contenedor);
    }

    const colores = {
        error:   { bg: "#fff5f5", border: "#fc8181", titulo: "#c53030" },
        warning: { bg: "#fffbeb", border: "#f6ad55", titulo: "#c05621" },
        success: { bg: "#f0fff4", border: "#68d391", titulo: "#276749" },
        info:    { bg: "#ebf8ff", border: "#63b3ed", titulo: "#2c5282" }
    };
    const c = colores[tipo] || colores.info;

    const notif = document.createElement("div");
    notif.id = `notif-${id}`;
    notif.style.cssText = `
        background:${c.bg}; border:1.5px solid ${c.border};
        border-left:4px solid ${c.border};
        border-radius:10px; padding:14px 16px;
        box-shadow:0 4px 16px rgba(0,0,0,0.12);
        animation:modalEntrar 0.25s ease;
        position:relative;`;

    notif.innerHTML = `
        <button onclick="cerrarNotificacionPersistente('${id}')" style="
            position:absolute; top:8px; right:8px;
            background:transparent; border:none; cursor:pointer;
            font-size:14px; color:#999; padding:2px 6px;
            border-radius:4px; line-height:1;">✕</button>
        <div style="display:flex;gap:10px;align-items:flex-start;padding-right:20px;">
            <span style="font-size:20px;flex-shrink:0;">${icono}</span>
            <div>
                <div style="font-size:13px;font-weight:700;color:${c.titulo};margin-bottom:3px;">
                    ${esc(titulo)}
                </div>
                <div style="font-size:13px;color:var(--text-main);line-height:1.4;">
                    ${esc(texto)}
                </div>
                ${accion ? `
                <button onclick="(${accion.fn.toString()})();cerrarNotificacionPersistente('${id}')" style="
                    margin-top:8px; background:${c.border}; color:#fff;
                    border:none; border-radius:6px; padding:5px 12px;
                    font-size:12px; font-weight:600; cursor:pointer;
                    font-family:var(--font);">
                    ${esc(accion.label)}
                </button>` : ""}
            </div>
        </div>`;

    contenedor.appendChild(notif);
}

function cerrarNotificacionPersistente(id) {
    const notif = document.getElementById(`notif-${id}`);
    if (notif) {
        notif.style.opacity   = "0";
        notif.style.transform = "translateX(20px)";
        notif.style.transition = "opacity 0.25s, transform 0.25s";
        setTimeout(() => notif.remove(), 250);
    }
}
