// ========== ELEMENTS ==========
const dashboardToast = document.getElementById("dashboardToast");
const sidebar = document.querySelector(".sidebar");
const topPageLabel = document.getElementById("topPageLabel");
const navItems = document.querySelectorAll(".nav-item[data-page]");
const notificationPanel = document.getElementById("notificationPanel");
const notificationButton = document.getElementById("notificationButton");


// ========== TOAST ==========
let toastTimer;

function showToast(message) {
    clearTimeout(toastTimer);
    dashboardToast.textContent = message;
    dashboardToast.classList.add("show");
    toastTimer = setTimeout(function () {
        dashboardToast.classList.remove("show");
    }, 2500);
}

// welcome message saved by the sign-in page, shown once
const saved = sessionStorage.getItem("toastMessage");
if (saved) {
    showToast(saved);
    sessionStorage.removeItem("toastMessage");
}


// ========== NAVIGATION ==========
const pageLabels = {
    dashboard: "Dashboard",
    feedback: "Feedback Board",
    presentations: "Presentations",
    queue: "Virtual Help Queue",
    profile: "My Profile"
};

function showSection(pageName) {
    document.querySelectorAll(".content-section").forEach(function (s) {
        s.classList.remove("active-section");
    });

    const selected = document.getElementById(pageName + "Section");
    if (selected) selected.classList.add("active-section");

    navItems.forEach(function (item) {
        item.classList.toggle("active", item.dataset.page === pageName);
    });

    topPageLabel.textContent = pageLabels[pageName] || "Dashboard";
    sidebar.classList.remove("mobile-open");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// sidebar, quick actions, "View All", announcement shortcuts
document.querySelectorAll("[data-page]").forEach(function (button) {
    button.addEventListener("click", function () {
        showSection(button.dataset.page);
    });
});

document.getElementById("mobileMenuButton").addEventListener("click", function () {
    sidebar.classList.toggle("mobile-open");
});


// ========== NOTIFICATIONS ==========
notificationButton.addEventListener("click", function (event) {
    event.stopPropagation();
    notificationPanel.classList.toggle("active");
});

document.getElementById("closeNotifications").addEventListener("click", function () {
    notificationPanel.classList.remove("active");
});

document.addEventListener("click", function (event) {
    if (!notificationPanel.contains(event.target) && !notificationButton.contains(event.target)) {
        notificationPanel.classList.remove("active");
    }
});

document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") notificationPanel.classList.remove("active");
});


// ========== FEEDBACK BOARD: COMMENTS (not saved to the database yet) ==========
function buildComment(name, text) {
    const comment = document.createElement("div");
    comment.className = "comment";
    comment.innerHTML =
        '<div class="thread-avatar small"></div>' +
        '<div><div class="comment-meta"><strong></strong>' +
        '<span class="chip member">Organization Member</span><small>Just now</small></div><p></p></div>';

    // textContent (not innerHTML) so typed text can never run as code
    comment.querySelector(".thread-avatar").textContent = name.charAt(0).toUpperCase();
    comment.querySelector("strong").textContent = name;
    comment.querySelector("p").textContent = text;
    return comment;
}

document.querySelectorAll(".comment-form").forEach(function (form) {
    form.addEventListener("submit", function (event) {
        event.preventDefault();

        const input = form.querySelector("input");
        const text = input.value.trim();
        if (!text) return;

        const thread = form.closest(".thread");
        const list = thread.querySelector(".comment-list");
        const name = document.getElementById("topName").textContent.trim();

        list.appendChild(buildComment(name, text));

        const count = list.querySelectorAll(".comment").length;
        thread.querySelector(".comment-count").textContent =
            count + (count === 1 ? " comment" : " comments");

        input.value = "";
        showToast("Comment posted.");
    });
});


// ========== VIRTUAL HELP QUEUE (not saved to the database yet) ==========
document.querySelectorAll(".join-call").forEach(function (button) {
    button.addEventListener("click", function () {
        button.textContent = "In call";
        button.disabled = true;
        showToast("Joining the anonymous call...");
    });
});


// ========== PRESENTATIONS (not saved to the database yet) ==========
document.getElementById("presentationForm").addEventListener("submit", function (event) {
    event.preventDefault();

    const title = document.getElementById("presTitle").value.trim();
    const subject = document.getElementById("presSubject").value;
    if (!title || !subject) {
        showToast("Please complete all fields.");
        return;
    }

    const card = document.createElement("div");
    card.className = "material-card";
    card.innerHTML =
        '<div class="material-top blue-material"><span></span></div>' +
        '<div class="material-body"><span></span><h3></h3>' +
        '<p>Just published.</p><button class="material-button" type="button">Edit</button></div>';

    card.querySelector(".material-top span").textContent = title.substring(0, 2).toUpperCase();
    card.querySelector(".material-body span").textContent = subject.toUpperCase();
    card.querySelector("h3").textContent = title;

    document.getElementById("presentationGrid").prepend(card);

    const stat = document.getElementById("statPresentations");
    stat.textContent = Number(stat.textContent) + 1;

    this.reset();
    showToast("Presentation published.");
});


// ========== CURRENT USER (names change per account) ==========
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

fetch("me")
    .then(function (response) {
        if (response.status === 401) { window.location.replace("obligeU.html"); return null; }
        if (!response.ok) throw new Error("me returned " + response.status);
        return response.json();
    })
    .then(function (user) {
        if (!user) return;
        if (user.role === null) {
            window.location.replace("obligeU.html");
            return;
        }
        if (user.role !== "organization") {
            window.location.replace("studentDashboard.html");
            return;
        }

        const initial = user.firstName.charAt(0).toUpperCase();

        setText("sidebarName", user.firstName);
        setText("topName", user.firstName);
        setText("welcomeName", user.firstName);
        setText("sidebarAvatar", initial);
        setText("topAvatar", initial);
        setText("profileAvatar", initial);
        setText("profileName", user.firstName + " " + user.lastName);
        setText("profileEmail", user.email);
    })
    .catch(function (error) {
        // a real error: stay on the page so it can be seen in the Console
        console.error("Could not load the current user:", error);
    });


// ========== LOG OUT ==========
document.getElementById("logoutButton").addEventListener("click", async function () {
    try {
        const response = await fetch("logout", { method: "POST" });
        if (!response.ok) throw new Error();

        window.location.href = "obligeU.html";
    } catch (error) {
        showToast("Could not log out. Please try again.");
    }
});