PGDMP                         }            final    14.7    14.7 a    m           0    0    ENCODING    ENCODING        SET client_encoding = 'UTF8';
                      false            n           0    0 
   STDSTRINGS 
   STDSTRINGS     (   SET standard_conforming_strings = 'on';
                      false            o           0    0 
   SEARCHPATH 
   SEARCHPATH     8   SELECT pg_catalog.set_config('search_path', '', false);
                      false            p           1262    66250    final    DATABASE     b   CREATE DATABASE final WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE = 'Russian_Russia.1251';
    DROP DATABASE final;
                postgres    false            �            1255    74561    generate_message_number()    FUNCTION     �  CREATE FUNCTION public.generate_message_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    last_number INTEGER;
BEGIN
    -- Получаем последний номер сообщения для данной заявки
    SELECT COALESCE(MAX(message_number), 0) INTO last_number
    FROM ticket_messages
    WHERE ticket_id = NEW.ticket_id;
    
    -- Увеличиваем номер на 1
    NEW.message_number = last_number + 1;
    
    RETURN NEW;
END;
$$;
 0   DROP FUNCTION public.generate_message_number();
       public          postgres    false            �            1255    74563    generate_ticket_number()    FUNCTION     �  CREATE FUNCTION public.generate_ticket_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    generated_number VARCHAR(20); -- Переменная для сгенерированного номера
    timestamp_part VARCHAR(14);
    random_part VARCHAR(6);
    exists_count INTEGER;
BEGIN
    LOOP -- Начинаем цикл для генерации и проверки
        timestamp_part := to_char(CURRENT_TIMESTAMP, 'YYYYMMDDHH24MISS');
        random_part := lpad(floor(random() * 1000000)::text, 6, '0');
        generated_number := timestamp_part || random_part; -- Присваиваем значение локальной переменной

        -- Проверяем, что такого номера еще нет, используя локальную переменную
        SELECT COUNT(*) INTO exists_count
        FROM tickets t -- Используем алиас t для таблицы tickets
        WHERE t.ticket_number = generated_number; -- Сравниваем с локальной переменной

        IF exists_count = 0 THEN
            EXIT; -- Если номер уникален, выходим из цикла
        END IF;
        -- Если номер не уникален, цикл начнется заново и сгенерирует новый номер
    END LOOP;

    RETURN generated_number; -- Возвращаем уникальный сгенерированный номер
END;
$$;
 /   DROP FUNCTION public.generate_ticket_number();
       public          postgres    false            �            1255    74564    handle_ticket_closure()    FUNCTION     (  CREATE FUNCTION public.handle_ticket_closure() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    closed_status_id INTEGER;
BEGIN
    -- Получаем ID статуса 'closed'
    SELECT id INTO closed_status_id FROM ticket_statuses WHERE name = 'closed';
    
    -- Если статус изменился на 'closed', устанавливаем closed_at
    IF NEW.status_id = closed_status_id AND 
       (OLD.status_id != NEW.status_id OR OLD.status_id IS NULL) THEN
        NEW.closed_at = CURRENT_TIMESTAMP;
    -- Если статус изменился с 'closed' на другой, сбрасываем closed_at
    ELSIF OLD.status_id = closed_status_id AND 
          NEW.status_id != OLD.status_id THEN
        NEW.closed_at = NULL;
    END IF;
    
    RETURN NEW;
END;
$$;
 .   DROP FUNCTION public.handle_ticket_closure();
       public          postgres    false            �            1255    74566    set_initial_closed_at()    FUNCTION     �  CREATE FUNCTION public.set_initial_closed_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    closed_status_id INTEGER;
BEGIN
    -- Получаем ID статуса 'closed'
    SELECT id INTO closed_status_id FROM ticket_statuses WHERE name = 'closed';
    
    -- Если статус 'closed', устанавливаем closed_at
    IF NEW.status_id = closed_status_id THEN
        NEW.closed_at = CURRENT_TIMESTAMP;
    END IF;
    
    RETURN NEW;
END;
$$;
 .   DROP FUNCTION public.set_initial_closed_at();
       public          postgres    false            �            1255    74543    update_updated_at_column()    FUNCTION     �   CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;
 1   DROP FUNCTION public.update_updated_at_column();
       public          postgres    false            �            1259    66309    clients    TABLE     �  CREATE TABLE public.clients (
    clients_id integer NOT NULL,
    email character varying(128) NOT NULL,
    fio character varying(128) NOT NULL,
    password character varying(255),
    "position" character varying(80) NOT NULL,
    company character varying(128) NOT NULL,
    activity character varying(128) NOT NULL,
    city character varying(80) NOT NULL,
    phone character varying(11)
);
    DROP TABLE public.clients;
       public         heap    postgres    false            �            1259    66308    clients_clients_id_seq    SEQUENCE     �   CREATE SEQUENCE public.clients_clients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
 -   DROP SEQUENCE public.clients_clients_id_seq;
       public          postgres    false    212            q           0    0    clients_clients_id_seq    SEQUENCE OWNED BY     Q   ALTER SEQUENCE public.clients_clients_id_seq OWNED BY public.clients.clients_id;
          public          postgres    false    211            �            1259    66463 	   documents    TABLE     `  CREATE TABLE public.documents (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    file_path character varying(255) NOT NULL,
    file_size integer,
    file_type character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
    DROP TABLE public.documents;
       public         heap    postgres    false            �            1259    66462    documents_id_seq    SEQUENCE     �   CREATE SEQUENCE public.documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
 '   DROP SEQUENCE public.documents_id_seq;
       public          postgres    false    214            r           0    0    documents_id_seq    SEQUENCE OWNED BY     E   ALTER SEQUENCE public.documents_id_seq OWNED BY public.documents.id;
          public          postgres    false    213            �            1259    74454    emails    TABLE     �  CREATE TABLE public.emails (
    id integer NOT NULL,
    thread_id character varying(255) NOT NULL,
    subject character varying(255) NOT NULL,
    body text NOT NULL,
    from_email character varying(255) NOT NULL,
    is_outgoing boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_closed boolean DEFAULT false,
    user_id integer
);
    DROP TABLE public.emails;
       public         heap    postgres    false            �            1259    74453    emails_id_seq    SEQUENCE     �   CREATE SEQUENCE public.emails_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
 $   DROP SEQUENCE public.emails_id_seq;
       public          postgres    false    220            s           0    0    emails_id_seq    SEQUENCE OWNED BY     ?   ALTER SEQUENCE public.emails_id_seq OWNED BY public.emails.id;
          public          postgres    false    219            �            1259    74520    ticket_attachments    TABLE     U  CREATE TABLE public.ticket_attachments (
    id integer NOT NULL,
    message_id integer NOT NULL,
    file_name character varying(255) NOT NULL,
    file_path character varying(255) NOT NULL,
    file_size integer NOT NULL,
    mime_type character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
 &   DROP TABLE public.ticket_attachments;
       public         heap    postgres    false            �            1259    74519    ticket_attachments_id_seq    SEQUENCE     �   CREATE SEQUENCE public.ticket_attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
 0   DROP SEQUENCE public.ticket_attachments_id_seq;
       public          postgres    false    226            t           0    0    ticket_attachments_id_seq    SEQUENCE OWNED BY     W   ALTER SEQUENCE public.ticket_attachments_id_seq OWNED BY public.ticket_attachments.id;
          public          postgres    false    225            �            1259    74494    ticket_messages    TABLE     �  CREATE TABLE public.ticket_messages (
    id integer NOT NULL,
    ticket_id integer NOT NULL,
    message_number integer NOT NULL,
    sender_type character varying(20) NOT NULL,
    sender_id integer,
    sender_email character varying(255) NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_read boolean DEFAULT false,
    email_message_id character varying(255),
    in_reply_to character varying(255),
    email_id integer
);
 #   DROP TABLE public.ticket_messages;
       public         heap    postgres    false            �            1259    74493    ticket_messages_id_seq    SEQUENCE     �   CREATE SEQUENCE public.ticket_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
 -   DROP SEQUENCE public.ticket_messages_id_seq;
       public          postgres    false    224            u           0    0    ticket_messages_id_seq    SEQUENCE OWNED BY     Q   ALTER SEQUENCE public.ticket_messages_id_seq OWNED BY public.ticket_messages.id;
          public          postgres    false    223            �            1259    74443    ticket_statuses    TABLE     �   CREATE TABLE public.ticket_statuses (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    description text
);
 #   DROP TABLE public.ticket_statuses;
       public         heap    postgres    false            �            1259    74442    ticket_statuses_id_seq    SEQUENCE     �   CREATE SEQUENCE public.ticket_statuses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
 -   DROP SEQUENCE public.ticket_statuses_id_seq;
       public          postgres    false    218            v           0    0    ticket_statuses_id_seq    SEQUENCE OWNED BY     Q   ALTER SEQUENCE public.ticket_statuses_id_seq OWNED BY public.ticket_statuses.id;
          public          postgres    false    217            �            1259    74471    tickets    TABLE     �  CREATE TABLE public.tickets (
    id integer NOT NULL,
    ticket_number character varying(20) NOT NULL,
    user_id integer NOT NULL,
    subject character varying(255) NOT NULL,
    status_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    closed_at timestamp with time zone,
    email_thread_id character varying(255)
);
    DROP TABLE public.tickets;
       public         heap    postgres    false            �            1259    74470    tickets_id_seq    SEQUENCE     �   CREATE SEQUENCE public.tickets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
 %   DROP SEQUENCE public.tickets_id_seq;
       public          postgres    false    222            w           0    0    tickets_id_seq    SEQUENCE OWNED BY     A   ALTER SEQUENCE public.tickets_id_seq OWNED BY public.tickets.id;
          public          postgres    false    221            �            1259    66295    users    TABLE     *  CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    fio character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    "position" character varying(255) NOT NULL,
    company character varying(255) NOT NULL,
    activity_sphere character varying(255) NOT NULL,
    city character varying(255) NOT NULL,
    phone character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
    DROP TABLE public.users;
       public         heap    postgres    false            �            1259    66294    users_id_seq    SEQUENCE     �   CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
 #   DROP SEQUENCE public.users_id_seq;
       public          postgres    false    210            x           0    0    users_id_seq    SEQUENCE OWNED BY     =   ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;
          public          postgres    false    209            �            1259    66475    videos    TABLE     y  CREATE TABLE public.videos (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    file_path character varying(255) NOT NULL,
    file_size integer NOT NULL,
    thumbnail_path character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
    DROP TABLE public.videos;
       public         heap    postgres    false            �            1259    66474    videos_id_seq    SEQUENCE     �   CREATE SEQUENCE public.videos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
 $   DROP SEQUENCE public.videos_id_seq;
       public          postgres    false    216            y           0    0    videos_id_seq    SEQUENCE OWNED BY     ?   ALTER SEQUENCE public.videos_id_seq OWNED BY public.videos.id;
          public          postgres    false    215            �           2604    66312    clients clients_id    DEFAULT     x   ALTER TABLE ONLY public.clients ALTER COLUMN clients_id SET DEFAULT nextval('public.clients_clients_id_seq'::regclass);
 A   ALTER TABLE public.clients ALTER COLUMN clients_id DROP DEFAULT;
       public          postgres    false    211    212    212            �           2604    66466    documents id    DEFAULT     l   ALTER TABLE ONLY public.documents ALTER COLUMN id SET DEFAULT nextval('public.documents_id_seq'::regclass);
 ;   ALTER TABLE public.documents ALTER COLUMN id DROP DEFAULT;
       public          postgres    false    213    214    214            �           2604    74457 	   emails id    DEFAULT     f   ALTER TABLE ONLY public.emails ALTER COLUMN id SET DEFAULT nextval('public.emails_id_seq'::regclass);
 8   ALTER TABLE public.emails ALTER COLUMN id DROP DEFAULT;
       public          postgres    false    219    220    220            �           2604    74523    ticket_attachments id    DEFAULT     ~   ALTER TABLE ONLY public.ticket_attachments ALTER COLUMN id SET DEFAULT nextval('public.ticket_attachments_id_seq'::regclass);
 D   ALTER TABLE public.ticket_attachments ALTER COLUMN id DROP DEFAULT;
       public          postgres    false    226    225    226            �           2604    74497    ticket_messages id    DEFAULT     x   ALTER TABLE ONLY public.ticket_messages ALTER COLUMN id SET DEFAULT nextval('public.ticket_messages_id_seq'::regclass);
 A   ALTER TABLE public.ticket_messages ALTER COLUMN id DROP DEFAULT;
       public          postgres    false    224    223    224            �           2604    74446    ticket_statuses id    DEFAULT     x   ALTER TABLE ONLY public.ticket_statuses ALTER COLUMN id SET DEFAULT nextval('public.ticket_statuses_id_seq'::regclass);
 A   ALTER TABLE public.ticket_statuses ALTER COLUMN id DROP DEFAULT;
       public          postgres    false    217    218    218            �           2604    74474 
   tickets id    DEFAULT     h   ALTER TABLE ONLY public.tickets ALTER COLUMN id SET DEFAULT nextval('public.tickets_id_seq'::regclass);
 9   ALTER TABLE public.tickets ALTER COLUMN id DROP DEFAULT;
       public          postgres    false    221    222    222            �           2604    66298    users id    DEFAULT     d   ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);
 7   ALTER TABLE public.users ALTER COLUMN id DROP DEFAULT;
       public          postgres    false    209    210    210            �           2604    66478 	   videos id    DEFAULT     f   ALTER TABLE ONLY public.videos ALTER COLUMN id SET DEFAULT nextval('public.videos_id_seq'::regclass);
 8   ALTER TABLE public.videos ALTER COLUMN id DROP DEFAULT;
       public          postgres    false    216    215    216            \          0    66309    clients 
   TABLE DATA           o   COPY public.clients (clients_id, email, fio, password, "position", company, activity, city, phone) FROM stdin;
    public          postgres    false    212   ��       ^          0    66463 	   documents 
   TABLE DATA           g   COPY public.documents (id, title, file_path, file_size, file_type, created_at, updated_at) FROM stdin;
    public          postgres    false    214   �       d          0    74454    emails 
   TABLE DATA           w   COPY public.emails (id, thread_id, subject, body, from_email, is_outgoing, created_at, is_closed, user_id) FROM stdin;
    public          postgres    false    220   ��       j          0    74520    ticket_attachments 
   TABLE DATA           t   COPY public.ticket_attachments (id, message_id, file_name, file_path, file_size, mime_type, created_at) FROM stdin;
    public          postgres    false    226   ��       h          0    74494    ticket_messages 
   TABLE DATA           �   COPY public.ticket_messages (id, ticket_id, message_number, sender_type, sender_id, sender_email, message, created_at, is_read, email_message_id, in_reply_to, email_id) FROM stdin;
    public          postgres    false    224   ��       b          0    74443    ticket_statuses 
   TABLE DATA           @   COPY public.ticket_statuses (id, name, description) FROM stdin;
    public          postgres    false    218   ,�       f          0    74471    tickets 
   TABLE DATA           �   COPY public.tickets (id, ticket_number, user_id, subject, status_id, created_at, updated_at, closed_at, email_thread_id) FROM stdin;
    public          postgres    false    222   ��       Z          0    66295    users 
   TABLE DATA           �   COPY public.users (id, email, fio, password_hash, "position", company, activity_sphere, city, phone, created_at, updated_at) FROM stdin;
    public          postgres    false    210   �       `          0    66475    videos 
   TABLE DATA           v   COPY public.videos (id, title, description, file_path, file_size, thumbnail_path, created_at, updated_at) FROM stdin;
    public          postgres    false    216   /�       z           0    0    clients_clients_id_seq    SEQUENCE SET     D   SELECT pg_catalog.setval('public.clients_clients_id_seq', 1, true);
          public          postgres    false    211            {           0    0    documents_id_seq    SEQUENCE SET     >   SELECT pg_catalog.setval('public.documents_id_seq', 3, true);
          public          postgres    false    213            |           0    0    emails_id_seq    SEQUENCE SET     <   SELECT pg_catalog.setval('public.emails_id_seq', 10, true);
          public          postgres    false    219            }           0    0    ticket_attachments_id_seq    SEQUENCE SET     G   SELECT pg_catalog.setval('public.ticket_attachments_id_seq', 3, true);
          public          postgres    false    225            ~           0    0    ticket_messages_id_seq    SEQUENCE SET     E   SELECT pg_catalog.setval('public.ticket_messages_id_seq', 22, true);
          public          postgres    false    223                       0    0    ticket_statuses_id_seq    SEQUENCE SET     D   SELECT pg_catalog.setval('public.ticket_statuses_id_seq', 4, true);
          public          postgres    false    217            �           0    0    tickets_id_seq    SEQUENCE SET     =   SELECT pg_catalog.setval('public.tickets_id_seq', 12, true);
          public          postgres    false    221            �           0    0    users_id_seq    SEQUENCE SET     ;   SELECT pg_catalog.setval('public.users_id_seq', 11, true);
          public          postgres    false    209            �           0    0    videos_id_seq    SEQUENCE SET     <   SELECT pg_catalog.setval('public.videos_id_seq', 1, false);
          public          postgres    false    215            �           2606    66316    clients clients_email_key 
   CONSTRAINT     U   ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_email_key UNIQUE (email);
 C   ALTER TABLE ONLY public.clients DROP CONSTRAINT clients_email_key;
       public            postgres    false    212            �           2606    66472    documents documents_pkey 
   CONSTRAINT     V   ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);
 B   ALTER TABLE ONLY public.documents DROP CONSTRAINT documents_pkey;
       public            postgres    false    214            �           2606    74464    emails emails_pkey 
   CONSTRAINT     P   ALTER TABLE ONLY public.emails
    ADD CONSTRAINT emails_pkey PRIMARY KEY (id);
 <   ALTER TABLE ONLY public.emails DROP CONSTRAINT emails_pkey;
       public            postgres    false    220            �           2606    74528 *   ticket_attachments ticket_attachments_pkey 
   CONSTRAINT     h   ALTER TABLE ONLY public.ticket_attachments
    ADD CONSTRAINT ticket_attachments_pkey PRIMARY KEY (id);
 T   ALTER TABLE ONLY public.ticket_attachments DROP CONSTRAINT ticket_attachments_pkey;
       public            postgres    false    226            �           2606    74503 $   ticket_messages ticket_messages_pkey 
   CONSTRAINT     b   ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_pkey PRIMARY KEY (id);
 N   ALTER TABLE ONLY public.ticket_messages DROP CONSTRAINT ticket_messages_pkey;
       public            postgres    false    224            �           2606    74452 (   ticket_statuses ticket_statuses_name_key 
   CONSTRAINT     c   ALTER TABLE ONLY public.ticket_statuses
    ADD CONSTRAINT ticket_statuses_name_key UNIQUE (name);
 R   ALTER TABLE ONLY public.ticket_statuses DROP CONSTRAINT ticket_statuses_name_key;
       public            postgres    false    218            �           2606    74450 $   ticket_statuses ticket_statuses_pkey 
   CONSTRAINT     b   ALTER TABLE ONLY public.ticket_statuses
    ADD CONSTRAINT ticket_statuses_pkey PRIMARY KEY (id);
 N   ALTER TABLE ONLY public.ticket_statuses DROP CONSTRAINT ticket_statuses_pkey;
       public            postgres    false    218            �           2606    74480    tickets tickets_pkey 
   CONSTRAINT     R   ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);
 >   ALTER TABLE ONLY public.tickets DROP CONSTRAINT tickets_pkey;
       public            postgres    false    222            �           2606    74482 !   tickets tickets_ticket_number_key 
   CONSTRAINT     e   ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_ticket_number_key UNIQUE (ticket_number);
 K   ALTER TABLE ONLY public.tickets DROP CONSTRAINT tickets_ticket_number_key;
       public            postgres    false    222            �           2606    66305    users users_email_key 
   CONSTRAINT     Q   ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);
 ?   ALTER TABLE ONLY public.users DROP CONSTRAINT users_email_key;
       public            postgres    false    210            �           2606    66303    users users_pkey 
   CONSTRAINT     N   ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
 :   ALTER TABLE ONLY public.users DROP CONSTRAINT users_pkey;
       public            postgres    false    210            �           2606    66484    videos videos_pkey 
   CONSTRAINT     P   ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_pkey PRIMARY KEY (id);
 <   ALTER TABLE ONLY public.videos DROP CONSTRAINT videos_pkey;
       public            postgres    false    216            �           1259    74540    idx_emails_thread_id    INDEX     L   CREATE INDEX idx_emails_thread_id ON public.emails USING btree (thread_id);
 (   DROP INDEX public.idx_emails_thread_id;
       public            postgres    false    220            �           1259    74541    idx_emails_user_id    INDEX     H   CREATE INDEX idx_emails_user_id ON public.emails USING btree (user_id);
 &   DROP INDEX public.idx_emails_user_id;
       public            postgres    false    220            �           1259    74542 !   idx_ticket_attachments_message_id    INDEX     f   CREATE INDEX idx_ticket_attachments_message_id ON public.ticket_attachments USING btree (message_id);
 5   DROP INDEX public.idx_ticket_attachments_message_id;
       public            postgres    false    226            �           1259    74539    idx_ticket_messages_email_id    INDEX     \   CREATE INDEX idx_ticket_messages_email_id ON public.ticket_messages USING btree (email_id);
 0   DROP INDEX public.idx_ticket_messages_email_id;
       public            postgres    false    224            �           1259    74538    idx_ticket_messages_sender_type    INDEX     b   CREATE INDEX idx_ticket_messages_sender_type ON public.ticket_messages USING btree (sender_type);
 3   DROP INDEX public.idx_ticket_messages_sender_type;
       public            postgres    false    224            �           1259    74537    idx_ticket_messages_ticket_id    INDEX     ^   CREATE INDEX idx_ticket_messages_ticket_id ON public.ticket_messages USING btree (ticket_id);
 1   DROP INDEX public.idx_ticket_messages_ticket_id;
       public            postgres    false    224            �           1259    74536    idx_tickets_email_thread_id    INDEX     Z   CREATE INDEX idx_tickets_email_thread_id ON public.tickets USING btree (email_thread_id);
 /   DROP INDEX public.idx_tickets_email_thread_id;
       public            postgres    false    222            �           1259    74535    idx_tickets_status_id    INDEX     N   CREATE INDEX idx_tickets_status_id ON public.tickets USING btree (status_id);
 )   DROP INDEX public.idx_tickets_status_id;
       public            postgres    false    222            �           1259    74534    idx_tickets_user_id    INDEX     J   CREATE INDEX idx_tickets_user_id ON public.tickets USING btree (user_id);
 '   DROP INDEX public.idx_tickets_user_id;
       public            postgres    false    222            �           1259    66306    idx_users_email    INDEX     B   CREATE INDEX idx_users_email ON public.users USING btree (email);
 #   DROP INDEX public.idx_users_email;
       public            postgres    false    210            �           2620    74562 "   ticket_messages set_message_number    TRIGGER     �   CREATE TRIGGER set_message_number BEFORE INSERT ON public.ticket_messages FOR EACH ROW EXECUTE FUNCTION public.generate_message_number();
 ;   DROP TRIGGER set_message_number ON public.ticket_messages;
       public          postgres    false    239    224            �           2620    74567    tickets set_ticket_closed_at    TRIGGER     �   CREATE TRIGGER set_ticket_closed_at BEFORE INSERT ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.set_initial_closed_at();
 5   DROP TRIGGER set_ticket_closed_at ON public.tickets;
       public          postgres    false    222    241            �           2620    74565    tickets update_ticket_closed_at    TRIGGER     �   CREATE TRIGGER update_ticket_closed_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.handle_ticket_closure();
 8   DROP TRIGGER update_ticket_closed_at ON public.tickets;
       public          postgres    false    240    222            �           2620    74559 !   tickets update_tickets_updated_at    TRIGGER     �   CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
 :   DROP TRIGGER update_tickets_updated_at ON public.tickets;
       public          postgres    false    227    222            �           2620    74560    users update_users_updated_at    TRIGGER     �   CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
 6   DROP TRIGGER update_users_updated_at ON public.users;
       public          postgres    false    210    227            �           2606    74465    emails emails_user_id_fkey    FK CONSTRAINT     �   ALTER TABLE ONLY public.emails
    ADD CONSTRAINT emails_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
 D   ALTER TABLE ONLY public.emails DROP CONSTRAINT emails_user_id_fkey;
       public          postgres    false    3236    220    210            �           2606    74529 5   ticket_attachments ticket_attachments_message_id_fkey    FK CONSTRAINT     �   ALTER TABLE ONLY public.ticket_attachments
    ADD CONSTRAINT ticket_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.ticket_messages(id) ON DELETE CASCADE;
 _   ALTER TABLE ONLY public.ticket_attachments DROP CONSTRAINT ticket_attachments_message_id_fkey;
       public          postgres    false    226    3262    224            �           2606    74514 -   ticket_messages ticket_messages_email_id_fkey    FK CONSTRAINT     �   ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_email_id_fkey FOREIGN KEY (email_id) REFERENCES public.emails(id) ON DELETE SET NULL;
 W   ALTER TABLE ONLY public.ticket_messages DROP CONSTRAINT ticket_messages_email_id_fkey;
       public          postgres    false    224    3248    220            �           2606    74509 .   ticket_messages ticket_messages_sender_id_fkey    FK CONSTRAINT     �   ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE SET NULL;
 X   ALTER TABLE ONLY public.ticket_messages DROP CONSTRAINT ticket_messages_sender_id_fkey;
       public          postgres    false    3236    224    210            �           2606    74504 .   ticket_messages ticket_messages_ticket_id_fkey    FK CONSTRAINT     �   ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;
 X   ALTER TABLE ONLY public.ticket_messages DROP CONSTRAINT ticket_messages_ticket_id_fkey;
       public          postgres    false    222    224    3255            �           2606    74488    tickets tickets_status_id_fkey    FK CONSTRAINT     �   ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.ticket_statuses(id);
 H   ALTER TABLE ONLY public.tickets DROP CONSTRAINT tickets_status_id_fkey;
       public          postgres    false    222    218    3246            �           2606    74483    tickets tickets_user_id_fkey    FK CONSTRAINT     �   ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
 F   ALTER TABLE ONLY public.tickets DROP CONSTRAINT tickets_user_id_fkey;
       public          postgres    false    222    3236    210            \   }   x�3�,I-.�+-N-2tH�H�-�I�K��弰��֋��.컰I�Q@���b;g�B压 �v\��ya"i�qa�]z��!
�
�z.l Ja�Ƌ�@�͜���F�\1z\\\ �b�      ^   �   x���1NC1��99��Q";�;gy���T��BO�
��nD`��:u���e���~y����f{��̓���v˓�٫��8n��^�Ow�8�.67���?f��Y�Q��B�J ���qb��{&H ��15�T ���է�95���HR�2���Qj-�����1`�_�0%�D�ӕ+"]���4.Q���?��Տ�{�	lŮ�      d   �  x��U]OA}���I|���������o������o�<��b4�L����b�v���#�̶ň�!bb����޹sι3gxP�;{/�W!Yę�1ɴV)�q�Xdtp-MH=]"ӧ�r#�5w�N�h)��Fk��\�fU>�,	�Di*t�M|�E���8#(�h�!��p��Ml��.�a�v��w&԰M`�sv ��.�C�'t��p �2���6�-�U�t�j1�k���E�!�;�X��1.o�x�{�`��� ����8h[cs؁�`�qZ�J�ܜx?����'L%B�0TR���򜫍r�a0��<��sFcab%ư�_��&j�J�<YXd 9���?����0'S<Q�J�̰ի%}�[#�՟�nc ��P*m����őU�BV��
��u��Q�"Q,�f�X�p�\���9���Ph7��[�3<�ȇ�k�<G���®�S؊�PI�՘�9�14(�Q̌�HI�E�q��3l�� k�=��-�����>B{d���z�WY��:�Tm4]�g�9g�ؗ�3j��SP�;��y{G�0�*���Q�NB�}��Ɵ��Bu�XUܪ.G�	�8��A7�-����C�푡�m��Kb��]r�ʈ Z���l����zxx;�6�-�9����A���~�?�����ݩ�#�������)|��c���tUZ*���J      j   �   x���Kn�0����W����ga�&�E�����R{��H��/}2(�P� �0@J&�Pș�~�⊥lt��n�Tc��>GL�sY��v�E�i-�������Sq]�1�c���}ɺ�ey��P�9�u�TN��j�?u��VS��q��'��(4�[s���,v��s�7��y������
C 6���v��x@���*x�!2�oY�q�^�Y�	b���i~�+�+      h   r  x���n�6���S�/�~�<A��� ٤E�ĵ�Hr���������EO=f��N�]��F�S�6#���J+� ���I�����VET}�b|��ک&�%�����-sk�PJ�4w��W����抇!�u:��D�V*Ad��*5�b�M�	�v�I�+0��Ø�I�Qܲ.H�T`Le�1��*0Z��)l锭�0F��h+�!f[`��!̣�O�*0�g[o����ڃ�>S����働ͧc���F�6�,��e��9�'�cq���~��z�����q��8o�,�O�^���s�E\�x�iO��(к>�{$��:�Ä��u�;�粛��A�e<�'w/9J���La�V�\��~2����ߌ'��Y�H*f)��V��ik�wZ�`sT�UN���"�xVL� ����|1��&	��&������/�H�Z-�-��5��ȶ�����t�]c60�%N2t^Mnc���a��Q�tSBU��6\�a[����Ub�%/8d�n튫);r��Ŝ�&�^�@�ޗ�r5�4�]�}���cM�oPh�KkY� L��NQ�<W9Kl�yVV���@p��,�=��EAH?�".,ЦU^X�ޗ�E�
�T�4������VJ<L+Y�O^��� A�C��$�<�椐#XBfʽO���� pShc�����Y�֚�C�اYO�NHg�j/�<�Η����C��{�#�0j�}.��s��l�Y��Y̚�ܱ���Yt�Q������9�n���x�$��Y:J?f���L_�u��qN�ތ?0�f�[�O���k׸�XneW���8�;�L9��s����Z�e�Y�^�O �f׮:�lx�Ol؝����ߺ���4ժ      b   �   x�u�M
�0���)r �9�PDk)H[R�mU\)t��3��h�P���FN*Xd3/�y|���?��5et�n(W���5LO��JXڱdW�F�V(�,�dc�e)���0��OS�s��P(�\�8�h�?f$6�pF�����N}���L�u��7U����q�s9�e��� ���9�K)_x�;      f     x���=��@��{
z��|�����u(�K���� ��p��F����y7zR*����3��)(T"u�`��a:x+� ~��H4�gfF��Pߨ�|�O?��S/�U��auH�wT��R	g��������O��#pFT'�hծfZ4B����x�K���X���(5�g9Ԏ�P�J֐E�V+j*;���R�&��� �,�QJ6E��JG���V��j���H*�5�+d�_\���{ɘ1Z_:�S��e����d�j��HD���� J�����Ñ�:�5��y��2y���H��e�U ���AR�F\�ב�1K�/6p��[8;��T��l�w!w����d;�(�aT��rA�p��X�r2k����([ʃ�릖|Oq �!����uj9>B,���t4��]̚�`�&r�Ө)�BVn�x�6FmԸlRK9V{�-e��&�&Ľ�c�<��Y���>o����B#H��-F�tH[�j��	)��&���P�W�������И���G=�������b-��K/9����aT      Z     x�ŕ�n�6���S��[Q��)�[vb9u�4R$�ȶ�'�,ےl˧�={��v�l+
�g��hR��i0��vH�����4�,�IYfIY ���KB�i\j�@,��$Q��T�Q�J(Q8-�0 �8@�О��Ұ�*'�{c�;�@N����K+�-2��i�F��e��7W��N��d�ם�+;�FF���H� �Kb�S�D%�P�"z\�'0��9��^�|8�B����������Q}��>����?>L�fC�݇:����{k�l33¨��յ?'c���XNs�t�������?���G��R�G����?B`X�Z��?�oE�>�p�����"���*B�Pƅ|	���Hg$��fDN�����w��Am.����M+I�w(�u�X�Ũ�����h�siW��*�g�Ĩ<$�Fȹo8$����F�b�ȝ����Etֳݛ��p�\�f��.�Fi���z����?�����G�b(�(0g��y��v-�og�u๽�v{�\M��Ar{g�a�R^4i�z��%����?nPHĄ=�Xd�)�%҃D���b���7q97�v�=�F�ޛ�w�i��l��&�Y�νtׁ�m���B5�@I�旬t
V\�4�
�`��O�������
�u��4F�����35o:��yֳ�1Z�3�&r �-�fCx��ţ1���x�x��(��RdYE�FDqmAE0$�2����P�
A�gC�|+��_H\�%      `      x������ � �     