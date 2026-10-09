// ========== ELEMENTS ==========
const dashboardToast = document.getElementById("dashboardToast");
const sidebar = document.querySelector(".sidebar");
const topPageLabel = document.getElementById("topPageLabel");
const navItems = document.querySelectorAll(".nav-item[data-page]");
const notificationPanel = document.getElementById("notificationPanel");
const announcementModal = document.getElementById("announcementModal");


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
    bulletin: "Bulletin Board",
    ask: "Ask for Help",
    offer: "Offer Help",
    virtual: "Virtual Help",
    materials: "Learning Materials",
    requests: "My Requests",
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

// every element with data-page (sidebar, quick actions, "View All", "+ New Request")
document.querySelectorAll("[data-page]").forEach(function (button) {
    button.addEventListener("click", function () {
        showSection(button.dataset.page);
    });
});

// "+ New Request" also puts the cursor in the topic box
document.querySelectorAll(".new-request-button").forEach(function (button) {
    button.addEventListener("click", function () {
        setTimeout(function () {
            document.getElementById("helpTopic").focus();
        }, 300);
    });
});

document.getElementById("mobileMenuButton").addEventListener("click", function () {
    sidebar.classList.toggle("mobile-open");
});


// ========== NOTIFICATIONS ==========
const notificationButton = document.getElementById("notificationButton");

notificationButton.addEventListener("click", function (event) {
    event.stopPropagation();
    notificationPanel.classList.toggle("active");
});

document.getElementById("closeNotifications").addEventListener("click", function () {
    notificationPanel.classList.remove("active");
});

// click anywhere outside closes the panel
document.addEventListener("click", function (event) {
    if (!notificationPanel.contains(event.target) && !notificationButton.contains(event.target)) {
        notificationPanel.classList.remove("active");
    }
});


// ========== POP-UP (announcements and learning materials) ==========
function openModal(label, title, text, date) {
    announcementModal.querySelector(".panel-label").textContent = label;
    document.getElementById("modalAnnouncementTitle").textContent = title;
    document.getElementById("modalAnnouncementText").textContent = text;
    document.getElementById("modalAnnouncementDate").textContent = date;
    announcementModal.classList.add("active");
}

function closeModal() {
    announcementModal.classList.remove("active");
}

document.getElementById("closeAnnouncement").addEventListener("click", closeModal);

announcementModal.addEventListener("click", function (event) {
    if (event.target === announcementModal) closeModal();
});


// ========== ANNOUNCEMENTS ==========
const announcementData = {
    "Midterm Examination Schedule": {
        text: "The updated examination schedule is now available. Students are encouraged to check their subjects, dates, and assigned rooms before the examination period.",
        date: "September 28, 2026 · Academic"
    },
    "Learning Materials Update": {
        text: "New learning materials have been added to the system for selected Computer Science subjects. Visit Learning Materials to browse the available resources.",
        date: "September 27, 2026 · System Update"
    },
    "Virtual Help Schedule": {
        text: "New virtual help schedules are available for students who need assistance with selected topics. Submit a Virtual Help request to get started.",
        date: "September 25, 2026 · Virtual Help"
    },
    "Keep Your Requests Organized": {
        text: "Please provide a clear subject, topic, and description when submitting a help request. Clear requests make it easier for helpers to understand your concern.",
        date: "September 23, 2026 · Reminder"
    }
};

document.querySelectorAll("[data-announcement]").forEach(function (button) {
    button.addEventListener("click", function () {
        const title = button.dataset.announcement;
        const data = announcementData[title];
        openModal(
            "ANNOUNCEMENT",
            title,
            data ? data.text : "Announcement details will be available soon.",
            data ? data.date : "ObligeU Bulletin Board"
        );
    });
});

document.getElementById("announcementSearch").addEventListener("input", function () {
    const search = this.value.toLowerCase().trim();
    let visible = 0;

    document.querySelectorAll(".large-announcement").forEach(function (card) {
        const match = card.textContent.toLowerCase().includes(search);
        card.style.display = match ? "" : "none";
        if (match) visible++;
    });

    if (search && visible === 0) showToast("No announcements found.");
});


// ========== ASK FOR HELP (not saved to the database yet) ==========
let requestCount = 3;

function addRequestToList(subject, topic) {
    const list = document.querySelector(".full-request-list");

    const item = document.createElement("div");
    item.className = "full-request";
    item.innerHTML =
        '<div class="request-topic-icon purple-bg"></div>' +
        '<div class="request-info"><h3></h3><span></span></div>' +
        '<span class="status pending">Pending</span>';

    // textContent (not innerHTML) so typed text can never run as code
    item.querySelector(".request-topic-icon").textContent = topic.substring(0, 2).toUpperCase();
    item.querySelector("h3").textContent = topic;
    item.querySelector(".request-info span").textContent = subject + " · Just now";

    list.prepend(item);

    const rows = list.querySelectorAll(".full-request");
    if (rows.length > 5) rows[rows.length - 1].remove();
}

document.getElementById("helpRequestForm").addEventListener("submit", function (event) {
    event.preventDefault();

    const subject = document.getElementById("helpSubject").value;
    const topic = document.getElementById("helpTopic").value.trim();
    const description = document.getElementById("helpDescription").value.trim();

    if (!subject || !topic || !description) {
        showToast("Please complete all fields.");
        return;
    }

    requestCount++;
    addRequestToList(subject, topic);
    document.querySelector(".profile-stat strong").textContent = requestCount;

    showToast("Your help request has been submitted!");
    this.reset();
    setTimeout(function () { showSection("requests"); }, 700);
});


// ========== OFFER HELP (not saved to the database yet) ==========
document.getElementById("offerForm").addEventListener("submit", function (event) {
    event.preventDefault();

    const subject = document.getElementById("offerSubject").value;
    const topic = document.getElementById("offerTopic").value.trim();
    const description = document.getElementById("offerDescription").value.trim();

    if (!subject || !topic || !description) {
        showToast("Please complete all fields.");
        return;
    }

    showToast("You're now listed as a helper for " + topic + "!");
    this.reset();
});


// ========== VIRTUAL HELP (not saved to the database yet) ==========
const virtualSchedule = document.getElementById("virtualSchedule");

// earliest allowed time = now (adjusted for the local time zone)
const now = new Date();
now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
virtualSchedule.min = now.toISOString().slice(0, 16);

document.getElementById("virtualForm").addEventListener("submit", function (event) {
    event.preventDefault();

    const subject = document.getElementById("virtualSubject").value;
    const topic = document.getElementById("virtualTopic").value.trim();
    const schedule = virtualSchedule.value;

    if (!subject || !topic || !schedule) {
        showToast("Please complete all fields.");
        return;
    }

    const formatted = new Date(schedule).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short"
    });

    showToast("Virtual Help requested for " + formatted + ".");
    this.reset();
});


// ========== LEARNING MATERIALS ==========
document.querySelectorAll(".material-filter").forEach(function (filter) {
    filter.addEventListener("click", function () {
        document.querySelectorAll(".material-filter").forEach(function (f) {
            f.classList.remove("active");
        });
        filter.classList.add("active");

        document.querySelectorAll(".material-card").forEach(function (card) {
            const match = filter.dataset.filter === "all" || card.dataset.category === filter.dataset.filter;
            card.style.display = match ? "" : "none";
        });
    });
});

const materialInfo = {
    "Java ArrayList Guide": {
        text: "A quick study resource covering ArrayList concepts, adding elements, removing elements, accessing values, and basic examples.",
        category: "Object Oriented Programming"
    },
    "SQL Fundamentals": {
        text: "Review SQL queries, tables, joins, filtering, and basic database concepts.",
        category: "Advance Database System"
    },
    "Probability Reviewer": {
        text: "Review sample spaces, events, probability expressions, and basic probability concepts.",
        category: "Discrete Structure"
    },
    "HTML & CSS Basics": {
        text: "Review webpage structure, HTML elements, CSS selectors, layout, and basic styling concepts.",
        category: "Human Computer Interaction"
    }
};

document.querySelectorAll(".material-button").forEach(function (button) {
    button.addEventListener("click", function () {
        const title = button.closest(".material-card").querySelector("h3").textContent.trim();
        const info = materialInfo[title];

        if (info) {
            openModal("LEARNING MATERIAL", title, info.text, info.category);
        } else {
            showToast("Learning material will open here.");
        }
    });
});


// ========== ESCAPE KEY ==========
document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
        closeModal();
        notificationPanel.classList.remove("active");
    }
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
        // wrong or missing role: send them where they belong
        if (user.role === null) {
            window.location.replace("obligeU.html");
            return;
        }
        if (user.role !== "student") {
            window.location.replace("orgDashboard.html");
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
        setText("profileFirstName", user.firstName);
        setText("profileLastName", user.lastName);
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