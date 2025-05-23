const API_BASE_URL = 'http://localhost:3001';
const adminLoginForm = document.getElementById('adminLoginForm');
const passwordInput = document.getElementById('password');
const errorMessageDiv = document.getElementById('errorMessage');
const loadingMessageDiv = document.getElementById('loadingMessage');
const loginButton = document.getElementById('loginButton');

const TOKEN_KEY = 'adminAuthToken';

if (localStorage.getItem(TOKEN_KEY)) {
    window.location.href = 'admin-tickets.html';
}

adminLoginForm.addEventListener('submit', async function(event) {
    event.preventDefault();

    const password = passwordInput.value;

    if (!password) {
        displayMessage('Пожалуйста, введите пароль.', true);
        return;
    }

    showLoading(true);
    clearMessage();

    try {
        const response = await fetch(`${API_BASE_URL}/auth-tech`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password: password }),
        });

        const data = await response.json();

        if (response.ok && data.token) {
            localStorage.setItem(TOKEN_KEY, data.token);
            displayMessage('Вход успешен! Перенаправление...', false);
            setTimeout(() => {
                window.location.href = 'admin-tickets.html';
            }, 1500);
        } else {
            displayMessage(data.message || `Ошибка: ${response.status}`, true);
        }
    } catch (error) {
        console.error('Ошибка при попытке входа:', error);
        displayMessage('Произошла сетевая ошибка или сервер недоступен. Попробуйте позже.', true);
    } finally {
        showLoading(false);
    }
});

function displayMessage(message, isError = false) {
    errorMessageDiv.textContent = message;
    errorMessageDiv.style.color = isError ? 'red' : 'green';
    errorMessageDiv.style.display = 'block';
}

function clearMessage() {
    errorMessageDiv.textContent = '';
    errorMessageDiv.style.display = 'none';
}

function showLoading(isLoading) {
    loadingMessageDiv.style.display = isLoading ? 'block' : 'none';
    loginButton.disabled = isLoading;
}
