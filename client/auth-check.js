// auth-check.js
(function() {
    const unauthenticatedLinksContainer = document.querySelector('.header__auth-links'); // Ваш основной контейнер для "Вход | Регистрация"
    let authenticatedLinksContainer; // Будет создан динамически или найден, если уже есть

    // Функция для обновления состояния хедера
    function updateHeaderDisplay(isLoggedIn, userData = null) {
        if (!unauthenticatedLinksContainer) {
            console.warn('Header auth links container (.header__auth-links) not found.');
            return;
        }

        if (isLoggedIn) {
            // Пользователь авторизован
            unauthenticatedLinksContainer.style.display = 'none';

            // Проверяем, есть ли уже контейнер для авторизованного пользователя
            authenticatedLinksContainer = document.getElementById('auth-links-authenticated-dynamic');
            if (!authenticatedLinksContainer) {
                // Создаем контейнер для авторизованного пользователя, если его нет
                authenticatedLinksContainer = document.createElement('div');
                authenticatedLinksContainer.id = 'auth-links-authenticated-dynamic';
                authenticatedLinksContainer.className = 'header__auth-links'; // Используем тот же класс для стилей

                const greetingSpan = document.createElement('span');
                greetingSpan.id = 'user-greeting-header-dynamic';
                greetingSpan.className = 'header__user-greeting'; // Добавьте стили

                const profileLink = document.createElement('a');
                profileLink.className = 'header__auth-link';
                profileLink.href = '../lk.html'; // Убедитесь, что путь корректен
                profileLink.textContent = 'Личный кабинет';

                const separatorSpan = document.createElement('span');
                separatorSpan.className = 'header__span';
                separatorSpan.textContent = '|';

                const logoutButton = document.createElement('button');
                logoutButton.id = 'logoutButtonHeaderDynamic';
                logoutButton.className = 'header__auth-link header__logout-btn'; // Классы для стилизации
                logoutButton.textContent = 'Выйти';
                logoutButton.addEventListener('click', handleLogout);

                //authenticatedLinksContainer.appendChild(greetingSpan);
                authenticatedLinksContainer.appendChild(profileLink);
                authenticatedLinksContainer.appendChild(separatorSpan);
                authenticatedLinksContainer.appendChild(logoutButton);

                // Вставляем новый контейнер после существующего (или в нужное место)
                unauthenticatedLinksContainer.parentNode.insertBefore(authenticatedLinksContainer, unauthenticatedLinksContainer.nextSibling);
            }

            // Обновляем приветствие
            const greetingElement = document.getElementById('user-greeting-header-dynamic');
            if (greetingElement) {
                if (userData && (userData.fio || userData.email)) {
                    greetingElement.textContent = `Привет, ${userData.fio || userData.email}!`;
                } else {
                    // Попробуем взять из localStorage, если userData не передали явно
                    const storedUserDataString = localStorage.getItem('userData');
                    if (storedUserDataString) {
                        try {
                            const storedUserData = JSON.parse(storedUserDataString);
                            greetingElement.textContent = `Привет, ${storedUserData.fio || storedUserData.email}!`;
                        } catch (e) { greetingElement.textContent = 'Профиль'; }
                    } else {
                        greetingElement.textContent = 'Профиль';
                    }
                }
            }
            authenticatedLinksContainer.style.display = 'flex'; // Показываем
        } else {
            // Пользователь не авторизован
            unauthenticatedLinksContainer.style.display = 'flex'; // Показываем (или как было в стилях)
            if (authenticatedLinksContainer) {
                authenticatedLinksContainer.style.display = 'none'; // Скрываем, если был создан
            }
        }
    }

    async function handleLogout() {
        const token = localStorage.getItem('token'); // Используйте 'token', как в вашем скрипте

        localStorage.removeItem('token');
        localStorage.removeItem('userData'); // Если сохраняли данные пользователя
        localStorage.removeItem('redirectAfterLogin'); // Очищаем и это на всякий случай

        // Устанавливаем флаг, что только что вышли
        sessionStorage.setItem('justLoggedOut', 'true');

        // Опциональный запрос на сервер для выхода
        if (token) { // Отправляем запрос на выход, только если токен был
            try {
                await fetch('/api/logout', { // Убедитесь, что URL /api/logout правильный
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}` // Если ваш /api/logout требует токен
                    }
                });
            } catch (error) {
                console.error('Ошибка при выходе на сервере:', error);
            }
        }

        // Обновляем хедер и перенаправляем
        updateHeaderDisplay(false);
        window.location.href = './auth.html'; // Перенаправляем на страницу входа
    }

    // --- Основная логика скрипта ---
    const justLoggedOut = sessionStorage.getItem('justLoggedOut');

    if (justLoggedOut === 'true') {
        sessionStorage.removeItem('justLoggedOut');
        updateHeaderDisplay(false); // Убедимся, что хедер для неавторизованного пользователя
        // Находимся на auth.html или куда был редирект, больше ничего не делаем
        return;
    }

    const token = localStorage.getItem('token'); // Имя ключа токена

    if (token) {
        // Токен есть, пользователь считается авторизованным (для отображения UI)
        // Попробуем получить userData из localStorage
        let userData = null;
        const userDataString = localStorage.getItem('userData');
        if (userDataString) {
            try {
                userData = JSON.parse(userDataString);
            } catch (e) { console.error("Error parsing userData from localStorage", e); }
        }
        updateHeaderDisplay(true, userData);
        // Скрипт завершается, страница загружается для авторизованного пользователя
    } else {
        // Токена нет, пользователь не авторизован
        updateHeaderDisplay(false); // Показываем хедер для неавторизованного

        const currentPage = window.location.pathname + window.location.search;
        // Исключаем страницы входа и регистрации из сохранения для редиректа
        if (!currentPage.includes('auth.html') && !currentPage.includes('reg.html')) {
            localStorage.setItem('redirectAfterLogin', currentPage);
        }

        // Перенаправляем на страницу входа, если мы НЕ на странице входа или регистрации
        // И если это не главная страница, куда иногда не нужно принудительно редиректить
        const currentPathFile = window.location.pathname.substring(window.location.pathname.lastIndexOf('/') + 1);
        if (currentPathFile !== 'auth.html' && currentPathFile !== 'reg.html') {
            // Раскомментируйте и используйте, если basePath нужен, но для простоты пока прямой путь
            // const pathSegments = window.location.pathname.split('/');
            // const depth = pathSegments.length - 2;
            // const basePath = depth > 0 ? '../'.repeat(depth) : './';
            // window.location.href = `${basePath}auth.html`;
            window.location.href = './auth.html'; // Убедитесь, что этот путь всегда корректен
                                                // или используйте абсолютный /auth.html
        }
    }
})();
