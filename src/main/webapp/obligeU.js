const authContainer = document.getElementById("authContainer");
const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");
const roleModal = document.getElementById("roleModal");
const roleChoices = document.querySelectorAll(".role-choice");
const toast = document.getElementById("toast");

// Change these two names if your files are called something else
function dashboardFor(role) {
    return role === "student" ? "studentDashboard.html" : "orgDashboard.html";
}

// already signed in with a role? skip the sign-in page and go to their dashboard
fetch("me")
    .then(function (response) {
        return response.ok ? response.json() : null;
    })
    .then(function (user) {
        if (user && user.role) {
            window.location.replace(dashboardFor(user.role));
        }
    })
    .catch(function () { /* not signed in, stay here */ });

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(function () {
        toast.classList.remove("show");
    }, 3000);
}

function openRegister() {
    authContainer.classList.add("register-mode");
}

function openLogin() {
    authContainer.classList.remove("register-mode");
}

document.getElementById("showRegister").addEventListener("click", openRegister);
document.getElementById("showLogin").addEventListener("click", openLogin);
document.getElementById("welcomeRegister").addEventListener("click", openRegister);
document.getElementById("welcomeLogin").addEventListener("click", openLogin);


// ---------- REGISTER ----------
registerForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const password = document.getElementById("registerPassword").value;
    const confirm = document.getElementById("confirmPassword").value;

    if (password !== confirm) {
        showToast("Passwords do not match.");
        return;
    }

    try {
        const response = await fetch("register", {
            method: "POST",
            body: new URLSearchParams(new FormData(registerForm))
        });

        if (response.ok) {
            roleModal.classList.add("active");
        } else if (response.status === 409) {
            showToast("That email is already registered.");
        } else {
            showToast("Please check your details and try again.");
        }
    } catch (error) {
        showToast("Could not reach the server.");
    }
});


// ---------- CHOOSE ROLE ----------
roleChoices.forEach(function (button) {
    button.addEventListener("click", async function () {
        const role = button.dataset.role;

        roleChoices.forEach(function (b) { b.disabled = true; });

        try {
            const response = await fetch("set-role", {
                method: "POST",
                body: new URLSearchParams({ role: role })
            });
            if (!response.ok) throw new Error();

            window.location.href = dashboardFor(role);
        } catch (error) {
            showToast("Something went wrong. Please try again.");
            roleChoices.forEach(function (b) { b.disabled = false; });
        }
    });
});


// ---------- SIGN IN ----------
loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    try {
        const response = await fetch("login", {
            method: "POST",
            body: new URLSearchParams({
                email: document.getElementById("loginEmail").value,
                password: document.getElementById("loginPassword").value
            })
        });

        if (response.status === 401) {
            showToast("Wrong email or password.");
            return;
        }
        if (!response.ok) {
            showToast("Something went wrong. Please try again.");
            return;
        }

        const user = await response.json();

        // registered earlier but never picked a role
        if (user.role === null) {
            roleModal.classList.add("active");
            return;
        }

        // the dashboard page shows this message when it loads
        sessionStorage.setItem("toastMessage", "Welcome back, " + user.firstName + "!");
        window.location.href = dashboardFor(user.role);

    } catch (error) {
        showToast("Could not reach the server.");
    }
});