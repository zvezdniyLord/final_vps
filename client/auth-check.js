// auth-check.js
(function() {
    const unauthenticatedLinksContainer = document.querySelector('.header__auth-links');
    let authenticatedLinksContainer;

    function updateHeaderDisplay(isLoggedIn, userData = null) {
        if (!unauthenticatedLinksContainer) {
            console.warn('Header auth links container (.header__auth-links) not found.');
            return;
        }

        if (isLoggedIn) {
            unauthenticatedLinksContainer.style.display = 'none';
            authenticatedLinksContainer = document.getElementById('auth-links-authenticated-dynamic');
            if (!authenticatedLinksContainer) {
                authenticatedLinksContainer = document.createElement('div');
                authenticatedLinksContainer.id = 'auth-links-authenticated-dynamic';
                authenticatedLinksContainer.className = 'header__auth-links';

                // Убрал динамическое создание приветствия, так как оно не использовалось
                // const greetingSpan = document.createElement('span');
                // greetingSpan.id = 'user-greeting-header-dynamic';
                // greetingSpan.className = 'header__user-greeting';

                const profileLink = document.createElement('a');
                profileLink.className = 'header__auth-link';
                profileLink.href = '../lk.html'; // Путь к личному кабинету
                profileLink.textContent = 'Личный кабинет'; // Можно заменить на userData.fio или email ниже

                const separatorSpan = document.createElement('span');
                separatorSpan.className = 'header__span';
                separatorSpan.textContent = '|';

                const logoutButton = document.createElement('button');
                logoutButton.id = 'logoutButtonHeaderDynamic';
                logoutButton.className = 'header__auth-link header__logout-btn';
                logoutButton.textContent = 'Выйти';
                logoutButton.addEventListener('click', handleLogout);

                // Обновляем текст ссылки на профиль, если есть userData
                if (userData && (userData.fio || userData.email)) {
                    profileLink.textContent = userData.fio || userData.email;
                } else {
                    const storedUserDataString = localStorage.getItem('userData');
                    if (storedUserDataString) {
                        try {
                            const storedUserData = JSON.parse(storedUserDataString);
                            profileLink.textContent = storedUserData.fio || storedUserData.email || 'Личный кабинет';
                        } catch (e) { /* profileLink.textContent остается 'Личный кабинет' */ }
                    }
                }


                // authenticatedLinksContainer.appendChild(greetingSpan); // Убрано
                authenticatedLinksContainer.appendChild(profileLink);
                authenticatedLinksContainer.appendChild(separatorSpan);
                authenticatedLinksContainer.appendChild(logoutButton);

                unauthenticatedLinksContainer.parentNode.insertBefore(authenticatedLinksContainer, unauthenticatedLinksContainer.nextSibling);
            } else {
                 // Если контейнер уже есть, просто обновим текст ссылки на профиль
                const profileLink = authenticatedLinksContainer.querySelector('a[href="../lk.html"]');
                if (profileLink) {
                    if (userData && (userData.fio || userData.email)) {
                        profileLink.textContent = userData.fio || userData.email;
                    } else {
                        const storedUserDataString = localStorage.getItem('userData');
                        if (storedUserDataString) {
                            try {
                                const storedUserData = JSON.parse(storedUserDataString);
                                profileLink.textContent = storedUserData.fio || storedUserData.email || 'Личный кабинет';
                            } catch (e) { /* profileLink.textContent остается 'Личный кабинет' */ }
                        } else {
                             profileLink.textContent = 'Личный кабинет'; // Дефолт, если ничего нет
                        }
                    }
                }
            }
            authenticatedLinksContainer.style.display = 'flex';
        } else {
            unauthenticatedLinksContainer.style.display = 'flex';
            if (authenticatedLinksContainer) {
                authenticatedLinksContainer.style.display = 'none';
            }
        }
    }

    async function handleLogout() {
        const token = localStorage.getItem('token');
        localStorage.removeItem('token');
        localStorage.removeItem('userData');
        localStorage.removeItem('redirectAfterLogin');
        sessionStorage.setItem('justLoggedOut', 'true');

        if (token) {
            try {
                await fetch('/api/logout', { // Убедитесь, что URL /api/logout правильный
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
            } catch (error) {
                console.error('Ошибка при выходе на сервере:', error);
            }
        }
        updateHeaderDisplay(false);
        // Перенаправляем на страницу входа. Убедитесь, что путь корректен
        // из любой точки сайта. Абсолютный путь может быть надежнее.
        window.location.href = '/auth.html'; // или './auth.html' если он всегда в той же директории
    }

    const justLoggedOut = sessionStorage.getItem('justLoggedOut');
    if (justLoggedOut === 'true') {
        sessionStorage.removeItem('justLoggedOut');
        updateHeaderDisplay(false);
        return;
    }

    const token = localStorage.getItem('token');
    let userData = null;
    if (token) {
        const userDataString = localStorage.getItem('userData');
        if (userDataString) {
            try {
                userData = JSON.parse(userDataString);
            } catch (e) { console.error("Error parsing userData from localStorage", e); }
        }
        updateHeaderDisplay(true, userData);
    } else {
        updateHeaderDisplay(false);

        const currentPathname = window.location.pathname;
        // Нормализуем путь: удаляем слэши в начале/конце и приводим к нижнему регистру
        const normalizedPath = currentPathname.replace(/^\/|\/$/g, '').toLowerCase();

        // Получаем имя файла
        let currentPageFile = normalizedPath.substring(normalizedPath.lastIndexOf('/') + 1);
        if (currentPageFile === '') {
            currentPageFile = 'index.html';
        }

        // Публичные страницы (в нижнем регистре)
        const publicPages = [
            'index.html', 'about.html', 'alarms.html', 'clientsecurity.html', 'contacts.html',
            'datatransport.html', 'demo.html', 'documentation.html', 'education.html',
            'historyserver.html', 'hmi.html', 'ienvcontrol.html', 'integrator.html',
            'iserver.html', 'licence.html', 'moscow.html', 'price.html', 'products.html',
            'reports.html', 'supports.html', 'systemreq.html', 'trends.html', 'video.html',
            'webhmi.html', 'auth.html', 'reg.html'  // Добавляем auth и reg для единообразия
        ];

        // Сохраняем текущую страницу для редиректа после логина
        if (!publicPages.includes(currentPageFile)) {
            localStorage.setItem('redirectAfterLogin', window.location.pathname + window.location.search);
        }

        // Перенаправляем только если страница не публичная
        if (!publicPages.includes(currentPageFile)) {
            window.location.href = './auth.html';
        }
    }
})();
