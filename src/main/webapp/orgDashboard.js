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
    announcements: "Post News",
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


// ========== HELPERS ==========
function emptyNote(text) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = text;
    return note;
}

// "2026-10-10 14:03:22.0" -> "5 min ago"
function timeAgo(text) {
    const d = new Date(text.replace(" ", "T"));
    const seconds = (Date.now() - d.getTime()) / 1000;
    if (isNaN(seconds) || seconds < 60) return "Just now";
    if (seconds < 3600) return Math.floor(seconds / 60) + " min ago";
    if (seconds < 86400) {
        const h = Math.floor(seconds / 3600);
        return h + (h === 1 ? " hour ago" : " hours ago");
    }
    if (seconds < 7 * 86400) {
        const days = Math.floor(seconds / 86400);
        return days + (days === 1 ? " day ago" : " days ago");
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}


// ========== FEEDBACK BOARD (saved to the database; any member can answer, members can delete) ==========
const feedbackList = document.getElementById("feedbackList");
const latestFeedbackList = document.getElementById("latestFeedbackList");

// a picture or file attached to a post or comment (the server sends it from /feedback-file)
function buildAttachment(type, id, fileName) {
    const url = "feedback-file?type=" + type + "&id=" + id;
    const box = document.createElement("div");
    box.className = "attachment";

    // pictures are shown in the page; click one to open it full size
    if (/\.(png|jpe?g|gif|webp)$/i.test(fileName)) {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        const img = document.createElement("img");
        img.src = url;
        img.alt = fileName;
        img.loading = "lazy";
        link.appendChild(img);
        box.appendChild(link);
        return box;
    }

    // anything else: a small card with a Download button (reuses the .file-match look)
    box.classList.add("file-match");
    box.innerHTML =
        '<div class="file-match-icon"></div>' +
        '<div class="file-match-info"><strong></strong></div>' +
        '<a class="download-button">Download</a>';
    box.querySelector(".file-match-icon").textContent = fileName.split(".").pop().substring(0, 4);
    box.querySelector("strong").textContent = fileName;
    box.querySelector("a").href = url;
    return box;
}

function buildComment(c, reload) {
    const comment = document.createElement("div");
    comment.className = "comment";
    const isMember = c.role === "organization";
    comment.innerHTML =
        '<div class="thread-avatar small"></div>' +
        '<div class="comment-body"><div class="comment-meta"><strong></strong>' +
        '<span class="chip"></span><small></small></div><p></p></div>' +
        '<button type="button" class="delete-button">Delete</button>';

    // textContent (not innerHTML) so typed text can never run as code
    comment.querySelector(".thread-avatar").textContent = c.author.charAt(0).toUpperCase();
    comment.querySelector("strong").textContent = c.author;
    const chip = comment.querySelector(".chip");
    chip.classList.add(isMember ? "member" : "student");
    chip.textContent = isMember ? "Organization Member" : "Student";
    comment.querySelector("small").textContent = timeAgo(c.createdAt);
    comment.querySelector("p").textContent = c.body;
    if (!c.body) comment.querySelector("p").remove();           // a picture with no text
    if (c.fileName) {
        comment.querySelector(".comment-body").appendChild(buildAttachment("comment", c.id, c.fileName));
    }

    comment.querySelector(".delete-button").addEventListener("click", async function () {
        if (!confirm("Delete this comment? Use this for anything not related to academics.")) return;
        try {
            const response = await fetch("feedback?type=comment&id=" + c.id, { method: "DELETE" });
            if (response.status === 403) { showToast("Only organization members can delete comments."); return; }
            if (!response.ok && response.status !== 404) throw new Error();
            showToast("Comment deleted.");
            reload();
        } catch (error) {
            showToast("Could not delete the comment. Please try again.");
        }
    });
    return comment;
}

function buildThread(post, drafts, reload) {
    const thread = document.createElement("article");
    thread.className = "thread";
    thread.innerHTML =
        '<div class="thread-head"><div class="thread-avatar"></div>' +
        '<div class="thread-meta"><strong></strong><span class="chip student">Student</span><small></small></div>' +
        '<span class="status"></span>' +
        '<button type="button" class="delete-button delete-post">Delete</button></div>' +
        '<p class="thread-text"></p>' +
        '<div class="thread-tags"><span class="comment-count"></span></div>' +
        '<div class="comment-list"></div>' +
        '<form class="comment-form"><input type="text" maxlength="1000" placeholder="Write a comment..." required>' +
        '<button type="submit" class="submit-button">Comment</button></form>';

    thread.querySelector(".thread-avatar").textContent = post.author.charAt(0).toUpperCase();
    thread.querySelector(".thread-meta strong").textContent = post.author;
    thread.querySelector(".thread-meta small").textContent = timeAgo(post.createdAt);
    thread.querySelector(".thread-text").textContent = post.body;
    if (!post.body) thread.querySelector(".thread-text").remove();     // a picture with no text
    if (post.fileName) {
        thread.querySelector(".thread-tags").before(buildAttachment("post", post.id, post.fileName));   // under the text
    }

    const answered = post.comments.length > 0;
    const status = thread.querySelector(".status");
    status.textContent = answered ? "Answered" : "Open";
    status.classList.add(answered ? "resolved" : "pending");

    const n = post.comments.length;
    thread.querySelector(".comment-count").textContent = n + (n === 1 ? " comment" : " comments");

    const list = thread.querySelector(".comment-list");
    post.comments.forEach(function (c) { list.appendChild(buildComment(c, reload)); });

    thread.querySelector(".delete-post").addEventListener("click", async function () {
        if (!confirm("Delete this feedback request and all of its comments?")) return;
        try {
            const response = await fetch("feedback?type=post&id=" + post.id, { method: "DELETE" });
            if (response.status === 403) { showToast("Only organization members can delete posts."); return; }
            if (!response.ok && response.status !== 404) throw new Error();
            showToast("Feedback request deleted.");
            reload();
        } catch (error) {
            showToast("Could not delete the post. Please try again.");
        }
    });

    const form = thread.querySelector(".comment-form");
    const input = form.querySelector("input");
    if (drafts[post.id]) input.value = drafts[post.id];

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) return;

        try {
            const response = await fetch("feedback", {
                method: "POST",
                body: new URLSearchParams({ postId: post.id, body: text })
            });
            if (response.status === 404) {
                showToast("That request was deleted.");
                reload();
                return;
            }
            if (!response.ok) throw new Error();

            input.value = "";
            showToast("Comment posted.");
            reload();
        } catch (error) {
            showToast("Could not post the comment. Please try again.");
        }
    });

    return thread;
}

function renderLatestFeedback(posts) {
    // newest requests that nobody has answered yet
    const open = posts.filter(function (p) { return p.comments.length === 0; });
    document.getElementById("statOpenFeedback").textContent = open.length;

    latestFeedbackList.innerHTML = "";
    if (open.length === 0) {
        latestFeedbackList.appendChild(emptyNote("Every request has been answered."));
        return;
    }

    const colors = ["pink-item", "purple-item", "green-item"];
    open.slice(0, 3).forEach(function (p, i) {
        const d = new Date(p.createdAt.replace(" ", "T"));
        const row = document.createElement("button");
        row.type = "button";
        row.className = "announcement-item " + colors[i % colors.length];
        row.innerHTML =
            '<div class="announcement-date"><strong></strong><span></span></div>' +
            '<div><strong></strong><p></p></div><span class="arrow">›</span>';
        row.querySelector(".announcement-date strong").textContent = d.getDate();
        row.querySelector(".announcement-date span").textContent =
            d.toLocaleString("en-US", { month: "short" }).toUpperCase();
        row.querySelector("div:nth-child(2) strong").textContent = p.author;
        const preview = p.body || ("Attachment: " + p.fileName);   // a post can be just a picture
        row.querySelector("div:nth-child(2) p").textContent =
            preview.length > 70 ? preview.substring(0, 70) + "..." : preview;
        row.addEventListener("click", function () { showSection("feedback"); });
        latestFeedbackList.appendChild(row);
    });
}

function loadFeedback() {
    // keep half-typed comments when the board refreshes
    const drafts = {};
    feedbackList.querySelectorAll(".thread").forEach(function (t) {
        const value = t.querySelector(".comment-form input").value;
        if (value) drafts[t.dataset.id] = value;
    });

    fetch("feedback")
        .then(function (response) {
            if (response.status === 401) { window.location.replace("obligeU.html"); return null; }
            if (!response.ok) throw new Error();
            return response.json();
        })
        .then(function (posts) {
            if (!posts) return;
            feedbackList.innerHTML = "";

            if (posts.length === 0) {
                feedbackList.appendChild(emptyNote("No feedback requests yet. Students will post them here."));
            }
            posts.forEach(function (post) {
                const thread = buildThread(post, drafts, loadFeedback);
                thread.dataset.id = post.id;
                feedbackList.appendChild(thread);
            });
            renderLatestFeedback(posts);
        })
        .catch(function () {
            feedbackList.innerHTML = "";
            feedbackList.appendChild(emptyNote("Could not load the feedback board."));
        });
}

loadFeedback();
// pick up new student posts without a manual refresh
setInterval(function () {
    const typing = feedbackList.contains(document.activeElement);
    if (!document.hidden && !typing) loadFeedback();
}, 30000);


// ========== VIRTUAL HELP QUEUE (saved to the database; the call page is call.html) ==========

const queueTable = document.getElementById("queueTable");

// "Join call" (and "Rejoin"): claim the request, then open the call page in a new tab
async function joinCall(button, s) {
    // open the tab NOW, inside the click, or the browser's pop-up blocker stops it
    const tab = window.open("", "_blank");
    if (!tab) { showToast("Please allow pop-ups to join the call."); return; }

    button.disabled = true;
    try {
        const response = await fetch("virtual-help", {
            method: "POST",
            body: new URLSearchParams({ action: "join", id: s.id })
        });

        if (response.status === 401) { tab.close(); window.location.replace("obligeU.html"); return; }
        if (response.status === 409) {
            tab.close();
            showToast("Someone else already took this request.");
            loadQueue();
            return;
        }
        if (!response.ok) throw new Error();

        tab.location.href = "call.html?id=" + s.id;
        showToast("Joining the call...");
        loadQueue();
    } catch (error) {
        tab.close();
        button.disabled = false;
        showToast("Could not join the call. Please try again.");
    }
}

async function endCall(s) {
    if (!confirm("End this session?")) return;
    try {
        const response = await fetch("virtual-help", {
            method: "POST",
            body: new URLSearchParams({ action: "finish", id: s.id })
        });
        if (!response.ok && response.status !== 404) throw new Error();
        showToast("Session ended.");
        loadQueue();
    } catch (error) {
        showToast("Could not end the session. Please try again.");
    }
}

function loadQueue() {
    fetch("virtual-help")
        .then(function (response) {
            if (response.status === 401) { window.location.replace("obligeU.html"); return null; }
            if (!response.ok) throw new Error();
            return response.json();
        })
        .then(function (sessions) {
            if (!sessions) return;

            // keep the header row, replace everything else
            queueTable.querySelectorAll(".request-row:not(.table-header), .empty-note").forEach(function (el) {
                el.remove();
            });

            if (sessions.length === 0) {
                queueTable.appendChild(emptyNote("No students are waiting right now."));
                return;
            }

            sessions.forEach(function (s) {
                const when = new Date(s.scheduledAt.replace(" ", "T")).toLocaleString("en-US", {
                    dateStyle: "medium", timeStyle: "short"
                });

                const row = document.createElement("div");
                row.className = "request-row";
                row.innerHTML = "<span></span><span></span><span></span><span></span>";

                // only the request number is shown, never the student's name
                row.children[0].textContent = "Anonymous student #" + s.id;
                row.children[1].textContent = s.topic + " (" + s.subject + ") · for " + when;
                row.children[2].textContent = timeAgo(s.createdAt);

                const actions = row.children[3];
                actions.style.display = "flex";
                actions.style.gap = "8px";

                const join = document.createElement("button");
                join.type = "button";
                join.className = "view-button join-call";
                join.textContent = s.status === "active" ? "Rejoin" : "Join call";
                join.addEventListener("click", function () { joinCall(join, s); });
                actions.appendChild(join);

                if (s.status === "active") {
                    const end = document.createElement("button");
                    end.type = "button";
                    end.className = "view-button";
                    end.textContent = "End";
                    end.addEventListener("click", function () { endCall(s); });
                    actions.appendChild(end);
                }

                queueTable.appendChild(row);
            });
        })
        .catch(function () {
            queueTable.querySelectorAll(".request-row:not(.table-header), .empty-note").forEach(function (el) {
                el.remove();
            });
            queueTable.appendChild(emptyNote("Could not load the queue."));
        });
}

loadQueue();
// new requests show up without a manual refresh
setInterval(function () {
    if (!document.hidden) loadQueue();
}, 10000);


// ========== PRESENTATIONS (saved to the database, organization members only) ==========
const presentationGrid = document.getElementById("presentationGrid");
const presentationColors = {
    "Programming": "purple-material",
    "Database": "green-material",
    "Mathematics": "pink-material"
};
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function loadPresentations() {
    fetch("presentations")
        .then(function (response) {
            if (response.status === 401) { window.location.replace("obligeU.html"); return null; }
            if (!response.ok) throw new Error();
            return response.json();
        })
        .then(function (items) {
            if (!items) return;
            presentationGrid.innerHTML = "";
            document.getElementById("statPresentations").textContent = items.length;

            if (items.length === 0) {
                presentationGrid.appendChild(emptyNote("No files yet. Add one above so students can be matched to it."));
                return;
            }

            items.forEach(function (p) {
                const card = document.createElement("div");
                card.className = "material-card";
                card.innerHTML =
                    '<div class="material-top"><span></span></div>' +
                    '<div class="material-body"><span></span><h3></h3><p></p>' +
                    '<div class="file-actions">' +
                    '<button class="material-button download" type="button">Download</button>' +
                    '<button class="delete-button" type="button">Delete</button></div></div>';

                card.querySelector(".material-top").classList.add(presentationColors[p.subject] || "blue-material");
                card.querySelector(".material-top span").textContent = p.title.substring(0, 2).toUpperCase();
                card.querySelector(".material-body > span").textContent = p.subject.toUpperCase();
                card.querySelector("h3").textContent = p.title;
                card.querySelector("p").textContent =
                    "Keywords: " + p.keywords + " · " + p.fileName + " · by " + p.uploader;

                card.querySelector(".download").addEventListener("click", function () {
                    window.location.href = "presentation-file?id=" + p.id;
                });

                card.querySelector(".delete-button").addEventListener("click", async function () {
                    if (!confirm('Delete "' + p.title + '"? Students will no longer be matched to it.')) return;
                    try {
                        const response = await fetch("presentations?id=" + p.id, { method: "DELETE" });
                        if (response.status === 403) { showToast("Only organization members can delete files."); return; }
                        if (!response.ok && response.status !== 404) throw new Error();
                        showToast("File deleted.");
                        loadPresentations();
                    } catch (error) {
                        showToast("Could not delete the file. Please try again.");
                    }
                });

                presentationGrid.appendChild(card);
            });
        })
        .catch(function () {
            presentationGrid.innerHTML = "";
            presentationGrid.appendChild(emptyNote("Could not load the files."));
        });
}

document.getElementById("presentationForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const form = this;
    const title = document.getElementById("presTitle").value.trim();
    const subject = document.getElementById("presSubject").value;
    const keywords = document.getElementById("presKeywords").value.trim();
    const file = document.getElementById("presFile").files[0];

    if (!title || !subject || !keywords || !file) {
        showToast("Please complete all fields.");
        return;
    }
    if (file.size > MAX_FILE_BYTES) {
        showToast("That file is over 25 MB.");
        return;
    }

    const data = new FormData();
    data.append("title", title);
    data.append("subject", subject);
    data.append("keywords", keywords);
    data.append("file", file);

    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Uploading...";

    try {
        const response = await fetch("presentations", { method: "POST", body: data });

        if (response.status === 403) { showToast("Only organization members can upload files."); return; }
        if (response.status === 413) { showToast("That file is too large (25 MB max)."); return; }
        if (response.status === 400) { showToast("Check the fields. Allowed files: ppt, pptx, pdf, doc, docx."); return; }
        if (!response.ok) throw new Error();

        form.reset();
        showToast("Published. Students can now be matched to it.");
        loadPresentations();
    } catch (error) {
        showToast("Could not upload the file. Please try again.");
    } finally {
        button.disabled = false;
        button.textContent = "Publish presentation";
    }
});

loadPresentations();


// ========== NEWS (saved to the database, organization members only) ==========

// "2026-10-15" -> local Date (no time-zone shift)
function dayOf(text) {
    const p = text.split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function loadOrgAnnouncements() {
    fetch("announcements")
        .then(function (response) {
            if (!response.ok) throw new Error();
            return response.json();
        })
        .then(function (items) {
            const list = document.getElementById("orgAnnouncementList");
            list.innerHTML = "";

            if (items.length === 0) {
                list.textContent = "Nothing posted yet.";
                return;
            }

            items.forEach(function (a) {
                const posted = new Date(a.createdAt.replace(" ", "T"));
                const eventDay = a.eventDate ? dayOf(a.eventDate) : posted;
                const postedText = posted.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    + ", " + posted.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

                const row = document.createElement("div");
                row.className = "announcement-item purple-item";
                row.innerHTML =
                    '<div class="announcement-date"><strong></strong><span></span></div>' +
                    '<div><strong></strong><p></p></div>' +
                    '<button type="button" class="delete-button">Delete</button>';

                row.querySelector(".announcement-date strong").textContent = eventDay.getDate();
                row.querySelector(".announcement-date span").textContent =
                    eventDay.toLocaleString("en-US", { month: "short" }).toUpperCase();
                row.querySelector("div:nth-child(2) strong").textContent = a.title;
                row.querySelector("div:nth-child(2) p").textContent =
                    a.category + " · by " + a.author + " · posted " + postedText;

                row.querySelector(".delete-button").addEventListener("click", async function () {
                    if (!confirm('Delete "' + a.title + '"? Students will no longer see it.')) return;

                    try {
                        const response = await fetch("announcements?id=" + a.id, { method: "DELETE" });
                        if (response.status === 403) {
                            showToast("Only organization members can delete news.");
                            return;
                        }
                        if (!response.ok) throw new Error();

                        showToast("Announcement deleted.");
                        loadOrgAnnouncements();
                    } catch (error) {
                        showToast("Could not delete the announcement. Please try again.");
                    }
                });

                list.appendChild(row);
            });
        })
        .catch(function () {
            document.getElementById("orgAnnouncementList").textContent = "Could not load announcements.";
        });
}

// can't pick a past event date
document.getElementById("annEventDate").min = new Date().toLocaleDateString("en-CA");

document.getElementById("announcementForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const title = document.getElementById("annTitle").value.trim();
    const category = document.getElementById("annCategory").value;
    const eventDate = document.getElementById("annEventDate").value;
    const body = document.getElementById("annBody").value.trim();

    if (!title || !category || !eventDate || !body) {
        showToast("Please complete all fields.");
        return;
    }

    try {
        const response = await fetch("announcements", {
            method: "POST",
            body: new URLSearchParams({ title: title, category: category, eventDate: eventDate, body: body })
        });

        if (response.status === 403) {
            showToast("Only organization members can post news.");
            return;
        }
        if (!response.ok) throw new Error();

        this.reset();
        showToast("Announcement posted.");
        loadOrgAnnouncements();
    } catch (error) {
        showToast("Could not post the announcement. Please try again.");
    }
});

loadOrgAnnouncements();


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