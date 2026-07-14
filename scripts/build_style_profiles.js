#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MODEL_NAME = (process.env.GENRE_MODEL || "maest519").trim();
const TAXONOMY_FILE = path.join(ROOT, "data", MODEL_NAME, "discogs-taxonomy.json");
const DATA_OUTPUT = path.join(ROOT, "data", MODEL_NAME, "discogs-style-profiles.json");
const REPORT_OUTPUT = path.join(ROOT, "data", MODEL_NAME, "discogs-style-profiles.md");
const PUBLIC_OUTPUT = path.join(ROOT, "public", MODEL_NAME, "discogs-style-profiles.js");

const genreContext = {
  "Blues": {
    lineage: "非裔美国劳动歌、灵歌、田野呼喊和酒馆舞曲传统",
    center: "十二小节结构、蓝调音阶、呼应式唱法和带有即兴感的器乐回答",
    history: "从美国南方的民间表达进入唱片工业后，蓝调一路影响了爵士、R&B、摇滚和灵魂乐。"
  },
  "Brass & Military": {
    lineage: "军乐、社区铜管传统和公共仪式音乐",
    center: "铜管齐奏、鼓号节奏、清晰行进脉冲和适合户外传播的旋律",
    history: "它从军队、游行和地方社团场景发展而来，也进入了体育、庆典和电影配乐语汇。"
  },
  "Children's": {
    lineage: "儿童教育、家庭娱乐、校园歌谣和广播电视节目",
    center: "简单旋律、清楚吐字、重复句式和容易记忆的节奏",
    history: "随着唱片、电视和流媒体儿童内容扩张，它从传统童谣延伸到教育专辑、故事音频和角色歌曲。"
  },
  "Classical": {
    lineage: "欧洲艺术音乐、宗教音乐、宫廷音乐和现代学院派作曲传统",
    center: "书面谱面、结构发展、器乐音色组织和长期训练形成的演奏法",
    history: "它跨越中世纪至当代，风格变化常与宗教、宫廷、公共音乐会制度、现代主义和录音媒介有关。"
  },
  "Electronic": {
    lineage: "合成器、鼓机、采样器、录音室实验和俱乐部文化",
    center: "电子声源、循环律动、音色设计、低频系统和制作技术本身",
    history: "从实验磁带、迪斯科和早期合成器音乐发展到 House、Techno、Bass music 与流行舞曲，电子乐的分化主要由设备、场景和舞池功能推动。"
  },
  "Folk, World, & Country": {
    lineage: "地方民歌、舞曲、口传传统、乡村音乐和区域性流行工业",
    center: "地域语言、传统节奏型、民间乐器、叙事歌词和社群功能",
    history: "这个大类覆盖不同地区的传统与现代化过程，很多 style 都是在移民、城市化、广播唱片和旅游工业中被重新塑形。"
  },
  "Funk / Soul": {
    lineage: "Gospel、R&B、爵士和非裔美国流行音乐传统",
    center: "强后拍、律动贝斯、切分吉他、呼喊式人声和身体性的 groove",
    history: "从 1960 年代灵魂乐与 Funk 的兴起，到 Disco、R&B、Neo Soul 和现代流行制作，它一直是流行音乐律动语言的核心来源。"
  },
  "Hip Hop": {
    lineage: "街区派对、DJ break、MC 说唱、采样文化和城市青年表达",
    center: "鼓组 loop、押韵 flow、低频、采样拼贴和身份叙事",
    history: "1970 年代纽约街区文化之后，Hip Hop 不断按地域、制作技术和叙事立场分化，最终成为全球主流音乐语言。"
  },
  "Jazz": {
    lineage: "布鲁斯、拉格泰姆、铜管乐、非裔美国即兴传统和现代和声",
    center: "摇摆感、即兴、复杂和声、互动伴奏和乐手个人音色",
    history: "爵士从新奥尔良和芝加哥传播到纽约、欧洲与全球，在舞曲、艺术音乐和融合音乐之间持续变形。"
  },
  "Latin": {
    lineage: "拉丁美洲、加勒比、西班牙及非洲节奏传统的混合",
    center: "clave 或区域性节奏框架、打击乐、舞蹈功能、旋律装饰和西语/葡语歌唱",
    history: "它常在民间舞蹈、城市乐队、移民社区和跨国唱片工业之间流动，因此同一 style 往往兼具地方身份与流行传播性。"
  },
  "Non-Music": {
    lineage: "口述、声音档案、广播剧、现场记录、喜剧和实用音频出版",
    center: "语言内容、环境声、叙事结构、记录价值或功能性信息",
    history: "非音乐类标签更多描述声音媒介的用途；它们在广播、唱片、教育出版、有声书和播客时代不断扩张。"
  },
  "Pop": {
    lineage: "大众娱乐工业、歌舞剧、广播流行曲和跨国偶像体系",
    center: "清晰 hook、主唱中心、短时长结构、易传播旋律和制作上的时代感",
    history: "Pop 的历史与媒介变化紧密相连，从乐谱、广播、电视到流媒体，每个阶段都会重塑什么声音更容易成为大众入口。"
  },
  "Reggae": {
    lineage: "牙买加 Mento、Ska、Rocksteady、R&B 和 sound system 文化",
    center: "反拍吉他、厚重贝斯、鼓组 one-drop 或 dancehall riddim、空间化混音",
    history: "Reggae 从牙买加本土流行音乐进入全球视野，并通过 Dub、Dancehall、Ragga 和 Reggae-Pop 影响电子乐、Hip Hop 与世界流行。"
  },
  "Rock": {
    lineage: "Rock & Roll、Blues、Country、Garage、Punk 和现代录音棚乐队传统",
    center: "电吉他、鼓贝斯组合、riff、主唱人格、现场能量和乐队编制",
    history: "摇滚不断以青年文化、技术放大、地下场景和主流工业之间的拉扯来分化，从传统 Rock 到金属、朋克、独立和实验分支都在这个谱系内。"
  },
  "Stage & Screen": {
    lineage: "戏剧、电影、电视、游戏和音乐剧工业",
    center: "服务画面、角色、叙事或舞台动作的主题动机与情绪调度",
    history: "随着电影录音、百老汇、电视和游戏工业成熟，舞台与银幕音乐形成了从歌曲到管弦配乐的完整生产体系。"
  }
};

const exactExamples = {
  "Blues---Boogie Woogie": ["Pinetop Smith", "Pinetop's Boogie Woogie"],
  "Blues---Chicago Blues": ["Muddy Waters", "Mannish Boy"],
  "Blues---Country Blues": ["Mississippi John Hurt", "Candy Man Blues"],
  "Blues---Delta Blues": ["Robert Johnson", "Cross Road Blues"],
  "Blues---Electric Blues": ["B.B. King", "The Thrill Is Gone"],
  "Blues---Harmonica Blues": ["Little Walter", "Juke"],
  "Blues---Jump Blues": ["Louis Jordan", "Caldonia"],
  "Blues---Louisiana Blues": ["Slim Harpo", "I'm a King Bee"],
  "Blues---Modern Electric Blues": ["Stevie Ray Vaughan", "Pride and Joy"],
  "Blues---Piano Blues": ["Otis Spann", "Good Morning Mr. Blues"],
  "Blues---Rhythm & Blues": ["Ray Charles", "What'd I Say"],
  "Blues---Texas Blues": ["Stevie Ray Vaughan", "Texas Flood"],
  "Classical---Baroque": ["J.S. Bach", "Brandenburg Concerto No. 3"],
  "Classical---Choral": ["Eric Whitacre", "Sleep"],
  "Classical---Classical": ["Mozart", "Eine kleine Nachtmusik"],
  "Classical---Contemporary": ["Steve Reich", "Music for 18 Musicians"],
  "Classical---Impressionist": ["Claude Debussy", "Clair de lune"],
  "Classical---Medieval": ["Anonymous", "Dies irae"],
  "Classical---Modern": ["Igor Stravinsky", "The Rite of Spring"],
  "Classical---Neo-Classical": ["Igor Stravinsky", "Pulcinella Suite"],
  "Classical---Neo-Romantic": ["Samuel Barber", "Adagio for Strings"],
  "Classical---Opera": ["Giacomo Puccini", "Nessun dorma"],
  "Classical---Post-Modern": ["John Adams", "Short Ride in a Fast Machine"],
  "Classical---Renaissance": ["Giovanni Pierluigi da Palestrina", "Missa Papae Marcelli"],
  "Classical---Romantic": ["Tchaikovsky", "Swan Lake: Scene"],
  "Electronic---Acid": ["Phuture", "Acid Tracks"],
  "Electronic---Acid House": ["Phuture", "Acid Tracks"],
  "Electronic---Acid Jazz": ["Jamiroquai", "Virtual Insanity"],
  "Electronic---Ambient": ["Brian Eno", "An Ending (Ascent)"],
  "Electronic---Bassline": ["T2", "Heartbroken"],
  "Electronic---Berlin-School": ["Tangerine Dream", "Phaedra"],
  "Electronic---Big Beat": ["The Prodigy", "Firestarter"],
  "Electronic---Bleep": ["LFO", "LFO"],
  "Electronic---Breakbeat": ["The Chemical Brothers", "Block Rockin' Beats"],
  "Electronic---Breakcore": ["Venetian Snares", "Hajnal"],
  "Electronic---Chillwave": ["Washed Out", "Feel It All Around"],
  "Electronic---Chiptune": ["Anamanaguchi", "Endless Fantasy"],
  "Electronic---Dance-pop": ["Madonna", "Into the Groove"],
  "Electronic---Deep House": ["Mr. Fingers", "Can You Feel It"],
  "Electronic---Disco": ["Bee Gees", "Stayin' Alive"],
  "Electronic---Downtempo": ["Thievery Corporation", "Lebanese Blonde"],
  "Electronic---Drum n Bass": ["Goldie", "Inner City Life"],
  "Electronic---Dub Techno": ["Basic Channel", "Phylyps Trak"],
  "Electronic---Dubstep": ["Skream", "Midnight Request Line"],
  "Electronic---EBM": ["Front 242", "Headhunter"],
  "Electronic---Electro": ["Afrika Bambaataa & Soulsonic Force", "Planet Rock"],
  "Electronic---Electro House": ["Benny Benassi", "Satisfaction"],
  "Electronic---Euro House": ["Haddaway", "What Is Love"],
  "Electronic---Euro-Disco": ["Modern Talking", "You're My Heart, You're My Soul"],
  "Electronic---Eurobeat": ["Dave Rodgers", "Deja Vu"],
  "Electronic---Eurodance": ["Corona", "The Rhythm of the Night"],
  "Electronic---Freestyle": ["Shannon", "Let the Music Play"],
  "Electronic---Future Jazz": ["St Germain", "Rose Rouge"],
  "Electronic---Gabber": ["Rotterdam Terror Corps", "We're Gonna Blow Your Mind"],
  "Electronic---Garage House": ["Robin S.", "Show Me Love"],
  "Electronic---Glitch": ["Oval", "Do While"],
  "Electronic---Goa Trance": ["Hallucinogen", "LSD"],
  "Electronic---Grime": ["Wiley", "Wot Do U Call It?"],
  "Electronic---Hands Up": ["Cascada", "Everytime We Touch"],
  "Electronic---Happy Hardcore": ["Dune", "Hardcore Vibes"],
  "Electronic---Hardstyle": ["Headhunterz", "Dragonborn"],
  "Electronic---Hi NRG": ["Divine", "You Think You're a Man"],
  "Electronic---Hip-House": ["Technotronic", "Pump Up the Jam"],
  "Electronic---House": ["Frankie Knuckles", "Your Love"],
  "Electronic---IDM": ["Aphex Twin", "Windowlicker"],
  "Electronic---Industrial": ["Nine Inch Nails", "Closer"],
  "Electronic---Italo House": ["Black Box", "Ride on Time"],
  "Electronic---Italo-Disco": ["Gazebo", "I Like Chopin"],
  "Electronic---Italodance": ["Eiffel 65", "Blue (Da Ba Dee)"],
  "Electronic---Juke": ["DJ Rashad", "I Don't Give a Fuck"],
  "Electronic---Jungle": ["Shy FX", "Original Nuttah"],
  "Electronic---Minimal": ["Ricardo Villalobos", "Easy Lee"],
  "Electronic---Minimal Techno": ["Robert Hood", "Minus"],
  "Electronic---Modern Classical": ["Max Richter", "On the Nature of Daylight"],
  "Electronic---Musique Concrète": ["Pierre Schaeffer", "Etude aux chemins de fer"],
  "Electronic---New Age": ["Enya", "Orinoco Flow"],
  "Electronic---New Beat": ["Confetti's", "The Sound of C"],
  "Electronic---New Wave": ["New Order", "Blue Monday"],
  "Electronic---Nu-Disco": ["Daft Punk", "Get Lucky"],
  "Electronic---Progressive House": ["Sasha", "Xpander"],
  "Electronic---Progressive Trance": ["Paul van Dyk", "For an Angel"],
  "Electronic---Psy-Trance": ["Infected Mushroom", "Becoming Insane"],
  "Electronic---Synth-pop": ["Depeche Mode", "Enjoy the Silence"],
  "Electronic---Synthwave": ["Kavinsky", "Nightcall"],
  "Electronic---Tech House": ["FISHER", "Losing It"],
  "Electronic---Techno": ["Derrick May", "Strings of Life"],
  "Electronic---Trance": ["Energy 52", "Cafe Del Mar"],
  "Electronic---Trip Hop": ["Massive Attack", "Teardrop"],
  "Electronic---Tropical House": ["Kygo", "Firestone"],
  "Electronic---UK Garage": ["Artful Dodger", "Re-Rewind"],
  "Electronic---Vaporwave": ["Macintosh Plus", "リサフランク420 / 現代のコンピュー"],
  "Funk / Soul---Afrobeat": ["Fela Kuti", "Water No Get Enemy"],
  "Funk / Soul---Boogie": ["D-Train", "You're the One for Me"],
  "Funk / Soul---Contemporary R&B": ["TLC", "No Scrubs"],
  "Funk / Soul---Disco": ["Chic", "Le Freak"],
  "Funk / Soul---Funk": ["James Brown", "Get Up (I Feel Like Being a) Sex Machine"],
  "Funk / Soul---Gospel": ["Mahalia Jackson", "Move On Up a Little Higher"],
  "Funk / Soul---Neo Soul": ["Erykah Badu", "On & On"],
  "Funk / Soul---New Jack Swing": ["Bobby Brown", "My Prerogative"],
  "Funk / Soul---P.Funk": ["Parliament", "Flash Light"],
  "Funk / Soul---Rhythm & Blues": ["Ray Charles", "What'd I Say"],
  "Funk / Soul---Soul": ["Aretha Franklin", "Respect"],
  "Hip Hop---Boom Bap": ["Nas", "N.Y. State of Mind"],
  "Hip Hop---Bounce": ["DJ Jubilee", "Do The Jubilee All"],
  "Hip Hop---Cloud Rap": ["A$AP Rocky", "Peso"],
  "Hip Hop---Conscious": ["Public Enemy", "Fight the Power"],
  "Hip Hop---Crunk": ["Lil Jon & The East Side Boyz", "Get Low"],
  "Hip Hop---Electro": ["Afrika Bambaataa & Soulsonic Force", "Planet Rock"],
  "Hip Hop---G-Funk": ["Dr. Dre", "Nuthin' but a 'G' Thang"],
  "Hip Hop---Gangsta": ["N.W.A", "Straight Outta Compton"],
  "Hip Hop---Grime": ["Dizzee Rascal", "I Luv U"],
  "Hip Hop---Hardcore Hip-Hop": ["Onyx", "Slam"],
  "Hip Hop---Horrorcore": ["Geto Boys", "Mind Playing Tricks on Me"],
  "Hip Hop---Instrumental": ["DJ Shadow", "Building Steam with a Grain of Salt"],
  "Hip Hop---Jazzy Hip-Hop": ["A Tribe Called Quest", "Electric Relaxation"],
  "Hip Hop---Miami Bass": ["2 Live Crew", "Me So Horny"],
  "Hip Hop---Pop Rap": ["MC Hammer", "U Can't Touch This"],
  "Hip Hop---RnB/Swing": ["Mary J. Blige", "Real Love"],
  "Hip Hop---Screw": ["DJ Screw", "June 27th"],
  "Hip Hop---Trap": ["T.I.", "What You Know"],
  "Hip Hop---Trip Hop": ["Tricky", "Hell Is Round the Corner"],
  "Hip Hop---Turntablism": ["DJ Shadow", "Organ Donor"],
  "Jazz---Afro-Cuban Jazz": ["Dizzy Gillespie", "Manteca"],
  "Jazz---Avant-garde Jazz": ["Ornette Coleman", "Lonely Woman"],
  "Jazz---Big Band": ["Duke Ellington", "Take the A Train"],
  "Jazz---Bop": ["Charlie Parker", "Ko-Ko"],
  "Jazz---Bossa Nova": ["Stan Getz & Joao Gilberto", "The Girl from Ipanema"],
  "Jazz---Cool Jazz": ["Miles Davis", "So What"],
  "Jazz---Dixieland": ["Original Dixieland Jass Band", "Tiger Rag"],
  "Jazz---Free Jazz": ["Ornette Coleman", "Free Jazz"],
  "Jazz---Fusion": ["Weather Report", "Birdland"],
  "Jazz---Gypsy Jazz": ["Django Reinhardt", "Minor Swing"],
  "Jazz---Hard Bop": ["Art Blakey & The Jazz Messengers", "Moanin'"],
  "Jazz---Jazz-Funk": ["Herbie Hancock", "Chameleon"],
  "Jazz---Jazz-Rock": ["Steely Dan", "Aja"],
  "Jazz---Latin Jazz": ["Cal Tjader", "Soul Sauce"],
  "Jazz---Modal": ["Miles Davis", "So What"],
  "Jazz---Ragtime": ["Scott Joplin", "Maple Leaf Rag"],
  "Jazz---Smooth Jazz": ["George Benson", "Breezin'"],
  "Jazz---Soul-Jazz": ["Jimmy Smith", "Back at the Chicken Shack"],
  "Jazz---Swing": ["Benny Goodman", "Sing, Sing, Sing"],
  "Latin---Bolero": ["Los Panchos", "Sabor a Mi"],
  "Latin---Bossanova": ["Joao Gilberto", "Chega de Saudade"],
  "Latin---Cha-Cha": ["Perez Prado", "Cherry Pink and Apple Blossom White"],
  "Latin---Cumbia": ["Los Angeles Azules", "Como Te Voy a Olvidar"],
  "Latin---Forró": ["Luiz Gonzaga", "Asa Branca"],
  "Latin---Mambo": ["Perez Prado", "Mambo No. 5"],
  "Latin---Mariachi": ["Vicente Fernandez", "Volver, Volver"],
  "Latin---Merengue": ["Juan Luis Guerra", "La Bilirrubina"],
  "Latin---MPB": ["Caetano Veloso", "Sozinho"],
  "Latin---Norteño": ["Los Tigres del Norte", "La Puerta Negra"],
  "Latin---Ranchera": ["Vicente Fernandez", "El Rey"],
  "Latin---Reggaeton": ["Daddy Yankee", "Gasolina"],
  "Latin---Salsa": ["Celia Cruz", "La Vida Es Un Carnaval"],
  "Latin---Samba": ["Jorge Ben Jor", "Mas Que Nada"],
  "Latin---Son": ["Buena Vista Social Club", "Chan Chan"],
  "Latin---Tango": ["Carlos Gardel", "Por una cabeza"],
  "Latin---Vallenato": ["Carlos Vives", "La Gota Fria"],
  "Pop---Ballad": ["Whitney Houston", "I Will Always Love You"],
  "Pop---Bollywood": ["A.R. Rahman", "Jai Ho"],
  "Pop---Bubblegum": ["The Archies", "Sugar, Sugar"],
  "Pop---Chanson": ["Edith Piaf", "La vie en rose"],
  "Pop---City Pop": ["Mariya Takeuchi", "Plastic Love"],
  "Pop---Europop": ["ABBA", "Dancing Queen"],
  "Pop---Indie Pop": ["The Smiths", "There Is a Light That Never Goes Out"],
  "Pop---J-pop": ["Hikaru Utada", "First Love"],
  "Pop---K-pop": ["BTS", "Dynamite"],
  "Pop---Kayōkyoku": ["Kyu Sakamoto", "Ue o Muite Aruko"],
  "Pop---Novelty": ["Bobby McFerrin", "Don't Worry, Be Happy"],
  "Pop---Schlager": ["Helene Fischer", "Atemlos durch die Nacht"],
  "Pop---Vocal": ["Frank Sinatra", "Fly Me to the Moon"],
  "Reggae---Calypso": ["Harry Belafonte", "Day-O (Banana Boat Song)"],
  "Reggae---Dancehall": ["Sean Paul", "Get Busy"],
  "Reggae---Dub": ["King Tubby", "King Tubby Meets Rockers Uptown"],
  "Reggae---Lovers Rock": ["Janet Kay", "Silly Games"],
  "Reggae---Reggae": ["Bob Marley & The Wailers", "No Woman, No Cry"],
  "Reggae---Reggae-Pop": ["UB40", "Red Red Wine"],
  "Reggae---Rocksteady": ["Alton Ellis", "Rock Steady"],
  "Reggae---Roots Reggae": ["Bob Marley & The Wailers", "Exodus"],
  "Reggae---Ska": ["The Skatalites", "Guns of Navarone"],
  "Reggae---Soca": ["Arrow", "Hot Hot Hot"],
  "Rock---Acid Rock": ["The Jimi Hendrix Experience", "Purple Haze"],
  "Rock---Alternative Rock": ["Nirvana", "Smells Like Teen Spirit"],
  "Rock---AOR": ["Journey", "Don't Stop Believin'"],
  "Rock---Arena Rock": ["Queen", "We Will Rock You"],
  "Rock---Art Rock": ["David Bowie", "Heroes"],
  "Rock---Black Metal": ["Mayhem", "Freezing Moon"],
  "Rock---Blues Rock": ["Cream", "Sunshine of Your Love"],
  "Rock---Brit Pop": ["Oasis", "Wonderwall"],
  "Rock---Classic Rock": ["Led Zeppelin", "Stairway to Heaven"],
  "Rock---Country Rock": ["Eagles", "Take It Easy"],
  "Rock---Death Metal": ["Death", "Pull the Plug"],
  "Rock---Doo Wop": ["The Penguins", "Earth Angel"],
  "Rock---Doom Metal": ["Black Sabbath", "Black Sabbath"],
  "Rock---Dream Pop": ["Cocteau Twins", "Heaven or Las Vegas"],
  "Rock---Emo": ["My Chemical Romance", "Welcome to the Black Parade"],
  "Rock---Folk Rock": ["Bob Dylan", "Like a Rolling Stone"],
  "Rock---Funk Metal": ["Red Hot Chili Peppers", "Give It Away"],
  "Rock---Garage Rock": ["The Sonics", "Have Love, Will Travel"],
  "Rock---Glam": ["T. Rex", "Get It On"],
  "Rock---Goth Rock": ["Bauhaus", "Bela Lugosi's Dead"],
  "Rock---Grunge": ["Nirvana", "Come as You Are"],
  "Rock---Hard Rock": ["AC/DC", "Back in Black"],
  "Rock---Hardcore": ["Black Flag", "Rise Above"],
  "Rock---Heavy Metal": ["Black Sabbath", "Paranoid"],
  "Rock---Indie Rock": ["The Strokes", "Last Nite"],
  "Rock---Krautrock": ["Can", "Vitamin C"],
  "Rock---Math Rock": ["Don Caballero", "Don Caballero 3"],
  "Rock---Metalcore": ["Killswitch Engage", "My Curse"],
  "Rock---New Wave": ["The Cars", "Just What I Needed"],
  "Rock---Noise": ["Sonic Youth", "Teen Age Riot"],
  "Rock---Nu Metal": ["Linkin Park", "In the End"],
  "Rock---Pop Punk": ["blink-182", "All the Small Things"],
  "Rock---Pop Rock": ["Fleetwood Mac", "Go Your Own Way"],
  "Rock---Post Rock": ["Mogwai", "Mogwai Fear Satan"],
  "Rock---Post-Punk": ["Joy Division", "Love Will Tear Us Apart"],
  "Rock---Power Metal": ["Helloween", "Eagle Fly Free"],
  "Rock---Power Pop": ["Big Star", "September Gurls"],
  "Rock---Prog Rock": ["Pink Floyd", "Money"],
  "Rock---Progressive Metal": ["Dream Theater", "Pull Me Under"],
  "Rock---Psychedelic Rock": ["The Doors", "Light My Fire"],
  "Rock---Psychobilly": ["The Cramps", "Human Fly"],
  "Rock---Punk": ["Ramones", "Blitzkrieg Bop"],
  "Rock---Rock & Roll": ["Chuck Berry", "Johnny B. Goode"],
  "Rock---Rockabilly": ["Elvis Presley", "That's All Right"],
  "Rock---Shoegaze": ["My Bloody Valentine", "Only Shallow"],
  "Rock---Ska": ["The Specials", "A Message to You Rudy"],
  "Rock---Sludge Metal": ["Melvins", "Hooch"],
  "Rock---Soft Rock": ["Fleetwood Mac", "Dreams"],
  "Rock---Southern Rock": ["Lynyrd Skynyrd", "Sweet Home Alabama"],
  "Rock---Space Rock": ["Hawkwind", "Silver Machine"],
  "Rock---Speed Metal": ["Motorhead", "Ace of Spades"],
  "Rock---Stoner Rock": ["Kyuss", "Green Machine"],
  "Rock---Surf": ["Dick Dale", "Misirlou"],
  "Rock---Thrash": ["Metallica", "Master of Puppets"],
  "Rock---Twist": ["Chubby Checker", "The Twist"],
  "Rock---Yé-Yé": ["France Gall", "Poupée de cire, poupée de son"],
  "Stage & Screen---Musical": ["Andrew Lloyd Webber", "The Phantom of the Opera"],
  "Stage & Screen---Score": ["John Williams", "Main Title from Star Wars"],
  "Stage & Screen---Soundtrack": ["Bee Gees", "Stayin' Alive"],
  "Stage & Screen---Theme": ["John Williams", "Hedwig's Theme"]
};

const fallbackExamples = {
  "Blues": ["B.B. King", "The Thrill Is Gone"],
  "Brass & Military": ["John Philip Sousa", "The Stars and Stripes Forever"],
  "Children's": ["Traditional", "Twinkle, Twinkle, Little Star"],
  "Classical": ["Mozart", "Eine kleine Nachtmusik"],
  "Electronic": ["Daft Punk", "One More Time"],
  "Folk, World, & Country": ["Johnny Cash", "I Walk the Line"],
  "Funk / Soul": ["Aretha Franklin", "Respect"],
  "Hip Hop": ["Grandmaster Flash & The Furious Five", "The Message"],
  "Jazz": ["Miles Davis", "So What"],
  "Latin": ["Celia Cruz", "La Vida Es Un Carnaval"],
  "Non-Music": ["BBC Radio", "A classic radio documentary or spoken-word recording"],
  "Pop": ["Michael Jackson", "Billie Jean"],
  "Reggae": ["Bob Marley & The Wailers", "No Woman, No Cry"],
  "Rock": ["The Beatles", "Come Together"],
  "Stage & Screen": ["John Williams", "Main Title from Star Wars"]
};

const styleRules = [
  [/shoegaze|dream pop|ethereal/i, {
    idea: "用吉他效果器、朦胧人声和层叠音墙制造漂浮感",
    sound: ["厚重混响与延迟", "人声后置或融入音墙", "吉他纹理持续堆叠", "旋律常被包在噪声和和声雾气里"],
    history: "它从 1980 年代末英国独立场景和噪音流行中成型，后来影响 Dream Pop、Post-Rock 和许多独立流行制作。"
  }],
  [/delta blues|chicago blues|electric blues|harmonica blues|jump blues|louisiana blues|piano blues|texas blues|boogie woogie|rhythm & blues/i, {
    idea: "以蓝调曲式、蓝调音阶和个人化演唱/器乐回答塑造张力",
    sound: ["十二小节或变体结构", "蓝调音阶与滑音", "人声和乐器的 call-and-response", "节奏可从摇摆到强后拍变化"],
    history: "早期乡村蓝调进入城市和电声化场景后，逐渐发展出 Chicago、Texas、Jump、Piano 等分支，并直接推动 R&B 和摇滚形成。"
  }],
  [/baroque|classical|romantic|renaissance|medieval|impressionist|neo-classical|neo-romantic|opera|choral/i, {
    idea: "通过作曲结构、配器、和声语言和演奏传统表达时代审美",
    sound: ["明确的乐句发展", "器乐或声乐技法精细", "和声与织体承担叙事", "作品常依靠谱面和演奏诠释传承"],
    history: "艺术音乐的风格变迁通常与教会、宫廷、公共音乐会、民族主义、现代主义和录音媒介共同相关。"
  }],
  [/audiobook|comedy|dialogue|education|field recording|interview|monolog|poetry|political|promotional|radioplay|religious|spoken word/i, {
    idea: "把声音当作叙事、记录、传播或表演媒介，而不是以旋律和节拍为主要目标",
    sound: ["语言信息居前", "环境声或现场感可能比旋律更重要", "剪辑节奏服务叙事", "功能性和语境决定标签判断"],
    history: "这类声音从广播、唱片出版、田野记录和教育音频延伸到有声书、播客与档案出版。"
  }],
  [/black metal/i, {
    idea: "以极端金属的尖锐失真、快速 tremolo、blast beat 和阴冷氛围为核心",
    sound: ["高频化失真吉他墙", "急速鼓点与嘶吼", "低保真或寒冷空间感", "反主流、神秘或自然意象"],
    history: "1980 年代极端金属和 1990 年代北欧地下场景奠定了它的审美，后来又分化出氛围、抑郁、交响等方向。"
  }],
  [/death metal|goregrind|pornogrind|grindcore|deathcore/i, {
    idea: "把金属推向更重、更快、更具身体冲击的极端分支",
    sound: ["低频化吉他与密集 riff", "咆哮或 guttural 人声", "高速双踩和 blast beat", "技术性断裂或碾压式段落"],
    history: "它从 Thrash、Hardcore 和早期极端金属中发展出来，1990 年代后形成技术派、旋律派、碾核和核心化等支流。"
  }],
  [/hardcore|punk|crust|oi|power violence/i, {
    idea: "强调直接、短促、反权威的乐队能量",
    sound: ["高速下拨吉他", "群体式副歌或喊唱", "短歌结构", "粗粝现场感"],
    history: "Punk 在 1970 年代后期爆发，Hardcore 则把速度、音量和社群伦理进一步推向地下场景。"
  }],
  [/house|garage/i, {
    idea: "面向舞池的 4/4 律动，重视 groove、重复推进和人声 hook",
    sound: ["稳定四拍底鼓", "开放 hi-hat 与拍手", "循环 bassline", "灵魂乐或迪斯科采样"],
    history: "House 从芝加哥、纽约和英国俱乐部文化中扩散，之后按速度、低频、和声深度和商业化程度分化。"
  }],
  [/techno|schranz/i, {
    idea: "以机械重复、工业质感和渐进式音色变化制造舞池张力",
    sound: ["硬朗 kick", "冷峻合成器", "小幅度循环变化", "偏工具化的编曲"],
    history: "Techno 与底特律、柏林和欧洲地下俱乐部关系密切，后来分出 minimal、dub、hard、deep 等不同重心。"
  }],
  [/trance|goa|psy/i, {
    idea: "用持续脉冲、上升线条和长篇结构制造恍惚感",
    sound: ["快速四拍", "琶音合成器", "长 build-up 与 drop", "明亮或迷幻的 lead"],
    history: "Trance 在 1990 年代欧洲俱乐部与 Goa 派对文化中成型，随后进入大型电子音乐节和商业舞曲体系。"
  }],
  [/dub|reggae|ska|rocksteady|dancehall|ragga|soca|calypso/i, {
    idea: "围绕加勒比律动、低频和反拍组织身体感",
    sound: ["反拍吉他或键盘", "厚实贝斯", "鼓组 riddim", "空间化混音或 toast 人声"],
    history: "牙买加和加勒比 sound system 文化使这些 style 在本地舞会、移民社区和全球流行音乐之间持续传播。"
  }],
  [/bossa|samba|salsa|mambo|cumbia|tango|merengue|bolero|mariachi|ranchera|reggaeton/i, {
    idea: "把地区舞蹈节奏、歌唱传统和流行编曲结合起来",
    sound: ["明确舞步节奏", "打击乐或拨弦乐器突出", "旋律装饰强", "常有西语或葡语主唱"],
    history: "这些风格大多在地方民间传统、城市乐队和跨国唱片工业之间成型，是拉丁音乐进入全球大众语境的重要通道。"
  }],
  [/jazz|bop|swing|ragtime|fusion|modal/i, {
    idea: "以即兴、和声色彩和乐手互动为中心",
    sound: ["摇摆或切分律动", "即兴 solo", "扩展和声", "鼓贝斯与和声乐器互动"],
    history: "爵士从 20 世纪初的美国城市音乐出发，不断吸收古巴、巴西、摇滚、Funk 和学院派语言。"
  }],
  [/folk|country|bluegrass|honky tonk|hillbilly|cajun|celtic|fado|flamenco/i, {
    idea: "以地方叙事、传统乐器和歌唱腔调保留社群记忆",
    sound: ["原声弦乐器突出", "叙事性歌词", "舞曲或民歌结构", "地域口音和传统唱法"],
    history: "它们常从口传、舞会和家庭演奏进入唱片与广播，再被复兴运动、旅游工业或现代流行重新诠释。"
  }],
  [/soul|funk|r&b|boogie|disco|gospel/i, {
    idea: "把 gospel 式情感、人声爆发力和律动型乐队编制结合起来",
    sound: ["强烈后拍", "贝斯与鼓锁定 groove", "呼应式和声", "主唱情绪推进"],
    history: "从教会、R&B 和 1960 年代灵魂乐起步，它影响了 Disco、Hip Hop 采样、现代 R&B 和流行制作。"
  }],
  [/hip hop|rap|trap|boom bap|g-funk|gangsta|grime|crunk|bounce/i, {
    idea: "围绕 beat、flow、押韵和街区叙事展开",
    sound: ["鼓组 loop 或 808 低频", "说唱 flow", "采样或合成器 riff", "强调地域身份"],
    history: "从 DJ break 和 block party 文化出发，Hip Hop 按城市、制作设备、商业化程度和歌词主题形成大量分支。"
  }],
  [/pop|ballad|chanson|schlager|vocal|kayōkyoku|k-pop|j-pop/i, {
    idea: "以旋律记忆点、主唱辨识度和大众传播效率为核心",
    sound: ["清晰主副歌", "hook 密集", "人声靠前", "制作服务情绪和传播"],
    history: "Pop 风格常随广播、电视、偶像体系和流媒体平台变化，既吸收地下风格，也把它们整理成大众可入口的形式。"
  }],
  [/ambient|drone|dark ambient|new age/i, {
    idea: "把音乐从歌曲推进转向空间、持续音和聆听环境",
    sound: ["慢速或无明显鼓点", "长音铺底", "空间混响", "细微音色变化"],
    history: "它从实验音乐、环境录音、合成器专辑和冥想/疗愈市场中扩张，常介于艺术音乐与功能性聆听之间。"
  }],
  [/industrial|noise|power electronics|rhythmic noise/i, {
    idea: "用机器噪声、失真和不舒适的音响挑战传统音乐性",
    sound: ["金属质感噪声", "失真采样", "压迫性节奏", "冷峻或挑衅的表演姿态"],
    history: "工业与噪音音乐在 1970 年代后与先锋艺术、磁带文化和地下演出场景结合，后来影响电子、金属和 goth。"
  }]
];

function normalizeId(genre, style) {
  return `${genre}---${style}`;
}

// Fallback context for any genre not explicitly described above. Keeps the
// generator resilient if a model introduces a genre we have not annotated.
const DEFAULT_CONTEXT = {
  lineage: "Discogs 曲风分类体系",
  center: "该大类的典型节奏、音色与编曲习惯",
  history: "它在 Discogs 分类中作为上级大类，聚合了若干细分 style。"
};
const DEFAULT_EXAMPLE = ["Various Artists", "Representative Compilation"];

function contextFor(genre) {
  return genreContext[genre] || DEFAULT_CONTEXT;
}

function sentenceForStyle(genre, style) {
  const ctx = contextFor(genre);
  const rule = styleRules.find(([pattern]) => pattern.test(style) || pattern.test(`${genre} ${style}`));
  if (rule) return rule[1];
  return {
    idea: `把${ctx.center}放到更具体的 ${style} 语境中`,
    sound: [ctx.center, "曲式与音色会随地区、年代和发行物语境变化", "在当前 taxonomy 中适合作为细粒度识别标签"],
    history: ctx.history
  };
}

function trackFor(genre, style) {
  const exact = exactExamples[normalizeId(genre, style)];
  const fallback = fallbackExamples[genre] || DEFAULT_EXAMPLE;
  const source = exact || fallback;
  return {
    artist: source[0],
    title: source[1],
    role: exact ? "主流入门曲" : "大类入门曲",
    note: exact
      ? "这首/这件作品常被用作理解该 style 声音语言的入口。"
      : "该 style 缺少稳定单曲入口时，先从同一大类的主流曲目建立听感坐标。"
  };
}

function buildProfile(genre, style) {
  const ctx = contextFor(genre);
  const rule = sentenceForStyle(genre, style);
  const id = normalizeId(genre, style);
  const sound = [...new Set(rule.sound)].slice(0, 5);
  const listenFor = [
    `先抓 ${sound[0]}。`,
    sound[1] ? `再听 ${sound[1]} 如何支撑情绪或舞池功能。` : `再听编曲怎样维持重复与变化的平衡。`,
    `最后把它放回 ${genre} 的上级语境：${ctx.center}。`
  ];

  return {
    id,
    genre,
    style,
    title: `${genre} / ${style}`,
    overview: `${style} 是 Discogs400 中 ${genre} 大类下的 style。它的核心不是一个孤立标签，而在于${rule.idea}；判断时应同时看节奏、音色、人声/器乐位置和发行年代。`,
    styleFocus: sound,
    history: `它的上游语境来自 ${ctx.lineage}。${rule.history}`,
    listenFor,
    mainstreamEntry: trackFor(genre, style)
  };
}

function markdownFor(taxonomy, profiles) {
  const byGenre = new Map();
  for (const profile of profiles) {
    if (!byGenre.has(profile.genre)) byGenre.set(profile.genre, []);
    byGenre.get(profile.genre).push(profile);
  }

  const lines = [
    "# Discogs 音乐风格中文分析",
    "",
    `来源：${taxonomy.name} (${taxonomy.version})`,
    "",
    `说明：这份报告覆盖当前本地 taxonomy 的 ${profiles.length} 个 \`Genre---Style\` 标签。每个条目包含风格介绍、声音识别重点、历史脉络和一首主流入门曲；少数冷门或功能性标签会使用同一大类的入门曲作为听感坐标。`,
    ""
  ];

  for (const genre of taxonomy.genres) {
    const ctx = contextFor(genre.name);
    lines.push(`## ${genre.name}`, "");
    lines.push(`大类语境：${ctx.center}。${ctx.history}`, "");
    for (const profile of byGenre.get(genre.name) || []) {
      lines.push(`### ${profile.style}`);
      lines.push("");
      lines.push(profile.overview);
      lines.push("");
      lines.push(`- 风格重点：${profile.styleFocus.join("；")}。`);
      lines.push(`- 发展历史：${profile.history}`);
      lines.push(`- 听感入口：${profile.listenFor.join("")}`);
      lines.push(`- 主流入门音乐：${profile.mainstreamEntry.artist} - ${profile.mainstreamEntry.title}（${profile.mainstreamEntry.role}）。${profile.mainstreamEntry.note}`);
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const taxonomy = JSON.parse(fs.readFileSync(TAXONOMY_FILE, "utf8"));
  const profiles = [];
  for (const genre of taxonomy.genres || []) {
    for (const style of genre.styles || []) {
      profiles.push(buildProfile(genre.name, style));
    }
  }

  const data = {
    name: "Discogs Style Profiles",
    version: `${taxonomy.version}-profiles-1`,
    model: MODEL_NAME,
    generatedFrom: `data/${MODEL_NAME}/discogs-taxonomy.json`,
    language: "zh-CN",
    count: profiles.length,
    profiles
  };

  fs.mkdirSync(path.dirname(DATA_OUTPUT), { recursive: true });
  fs.mkdirSync(path.dirname(PUBLIC_OUTPUT), { recursive: true });
  fs.writeFileSync(DATA_OUTPUT, `${JSON.stringify(data, null, 2)}\n`);
  fs.writeFileSync(REPORT_OUTPUT, markdownFor(taxonomy, profiles));
  fs.writeFileSync(PUBLIC_OUTPUT, `window.DISCOGS_STYLE_PROFILES = ${JSON.stringify(data, null, 2)};\n`);
  console.log(`Model: ${MODEL_NAME}`);
  console.log(`Wrote ${DATA_OUTPUT}`);
  console.log(`Wrote ${REPORT_OUTPUT}`);
  console.log(`Wrote ${PUBLIC_OUTPUT}`);
  console.log(`Profiles: ${profiles.length}`);
}

main();
