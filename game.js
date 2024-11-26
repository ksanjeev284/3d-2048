class Game3D {
    constructor() {
        // Get the container element
        this.container = document.getElementById('game-container');
        
        // Setup renderer with full size
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.container.appendChild(this.renderer.domElement);
        
        // Setup scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);
        
        // Setup camera with adjusted aspect ratio
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        
        // Initialize renderer with proper settings
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        
        // Game state initialization
        this.grid = this.createEmptyGrid();
        this.previousStates = [];
        this.maxUndoSteps = 10;
        this.score = 0;
        this.previousScores = [];
        this.highScore = parseInt(localStorage.getItem('highScore')) || 0;
        this.moveCount = 0;
        this.startTime = Date.now();
        this.tiles = new Map();
        this.isAnimating = false;
        this.jellyfish = [];
        this.particles = [];
        this.clock = new THREE.Clock();
        this.gameOver = false;
        this.soundEnabled = localStorage.getItem('soundEnabled') !== 'false';

        // Initialize sound on first interaction
        const initSound = () => {
            window.soundManager.init();
            document.removeEventListener('click', initSound);
            document.removeEventListener('keydown', initSound);
            document.removeEventListener('touchstart', initSound);
        };
        document.addEventListener('click', initSound);
        document.addEventListener('keydown', initSound);
        document.addEventListener('touchstart', initSound);

        // Scene setup and initialization
        this.setupScene();
        this.setupLighting();
        this.setupCamera();
        this.setupControls();
        this.setupGameControls();
        
        // Game components initialization
        this.createBoard();
        this.addJellyfish(8);
        this.addInitialTiles();

        // Start the game loop
        this.animate();

        // Show tutorial for first-time players
        if (!localStorage.getItem('tutorialShown')) {
            this.showTutorial();
            localStorage.setItem('tutorialShown', 'true');
        }

        // Handle window resize
        this.handleResize();
    }

    setupScene() {
        this.scene.background = new THREE.Color(0x1a1a1a);
        this.boardGroup = new THREE.Group();
        this.scene.add(this.boardGroup);
    }

    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // Main directional light
        const mainLight = new THREE.DirectionalLight(0xffffff, 1);
        mainLight.position.set(10, 10, 10);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.camera.near = 0.5;
        mainLight.shadow.camera.far = 500;
        this.scene.add(mainLight);

        // Fill light
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-10, 5, -10);
        this.scene.add(fillLight);
    }

    setupCamera() {
        // Adjust camera position for the larger board
        this.camera.position.set(18, 22, 18); 
        this.camera.lookAt(0, 0, 0);
    }

    playSound(soundName) {
        if (this.soundEnabled && window.soundManager && window.soundManager.isInitialized) {
            try {
                window.soundManager[soundName]();
            } catch (error) {
                console.log('Sound error:', error);
            }
        }
    }

    createParticles(position, color) {
        const particleCount = 20;
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const velocities = [];

        for (let i = 0; i < particleCount; i++) {
            vertices.push(position.x, position.y, position.z);
            velocities.push(
                (Math.random() - 0.5) * 0.2,
                Math.random() * 0.2,
                (Math.random() - 0.5) * 0.2
            );
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const material = new THREE.PointsMaterial({
            color: color,
            size: 0.1,
            transparent: true,
            opacity: 1
        });

        const particles = new THREE.Points(geometry, material);
        particles.userData.velocities = velocities;
        particles.userData.life = 1.0;
        this.particles.push(particles);
        this.scene.add(particles);
    }

    updateParticles(deltaTime) {
        if (!this.particles) {
            this.particles = [];
            return;
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.userData.velocities[1] -= 9.8 * deltaTime; // Gravity
            particle.position.x += particle.userData.velocities[0] * deltaTime;
            particle.position.y += particle.userData.velocities[1] * deltaTime;
            particle.position.z += particle.userData.velocities[2] * deltaTime;
            particle.userData.life -= deltaTime;

            if (particle.userData.life <= 0) {
                this.scene.remove(particle);
                this.particles.splice(i, 1);
            }
        }
    }

    showTutorial() {
        const tutorial = document.createElement('div');
        tutorial.className = 'tutorial overlay';
        tutorial.innerHTML = `
            <div class="tutorial-content">
                <h2>How to Play</h2>
                <p>⬆️ Use arrow keys or swipe to move tiles</p>
                <p>🔄 Combine matching numbers</p>
                <p>🎯 Reach 2048 to win!</p>
                <p>↩️ Press 'U' to undo last move</p>
                <p>🔊 Press 'M' to toggle sound</p>
                <button class="button" onclick="this.parentElement.parentElement.remove()">Got it!</button>
            </div>
        `;
        document.body.appendChild(tutorial);
    }

    saveState() {
        this.previousStates.push(this.grid.map(row => [...row]));
        this.previousScores.push(this.score);
        if (this.previousStates.length > this.maxUndoSteps) {
            this.previousStates.shift();
            this.previousScores.shift();
        }
    }

    undo() {
        if (this.previousStates.length === 0 || this.isAnimating) return;

        // Clear current tiles
        this.tiles.forEach(tile => {
            this.boardGroup.remove(tile);
        });
        this.tiles.clear();

        // Restore previous state
        this.grid = this.previousStates.pop().map(row => [...row]);
        this.score = this.previousScores.pop();
        
        // Recreate tiles
        for (let x = 0; x < 4; x++) {
            for (let y = 0; y < 4; y++) {
                if (this.grid[x][y] !== 0) {
                    this.createTile(this.grid[x][y], x, y);
                }
            }
        }

        this.updateScore();
    }

    updateStats() {
        // Update high score
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('highScore', this.score);
        }

        // Update move count
        document.getElementById('move-count').textContent = `Moves: ${this.moveCount}`;
        
        // Update time played
        const timePlayedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        const minutes = Math.floor(timePlayedSeconds / 60);
        const seconds = timePlayedSeconds % 60;
        document.getElementById('time-played').textContent = 
            `Time: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    createEmptyGrid() {
        return Array(4).fill().map(() => Array(4).fill(0));
    }

    createBoard() {
        // Create game board with larger dimensions
        const boardGeometry = new THREE.BoxGeometry(12, 0.5, 12); 
        const boardMaterial = new THREE.MeshPhongMaterial({ color: 0x966F33 });
        const board = new THREE.Mesh(boardGeometry, boardMaterial);
        board.receiveShadow = true;
        this.boardGroup.add(board);

        // Create grid lines with adjusted spacing
        for (let i = 0; i <= 4; i++) {
            const lineGeometry = new THREE.BoxGeometry(0.2, 0.6, 12); 
            const lineMaterial = new THREE.MeshPhongMaterial({ color: 0x795548 });
            const verticalLine = new THREE.Mesh(lineGeometry, lineMaterial);
            verticalLine.position.x = -6 + (i * 3); 
            verticalLine.position.y = 0.25;
            this.boardGroup.add(verticalLine);

            const horizontalLine = new THREE.Mesh(new THREE.BoxGeometry(12, 0.6, 0.2), lineMaterial);
            horizontalLine.position.z = -6 + (i * 3); 
            horizontalLine.position.y = 0.25;
            this.boardGroup.add(horizontalLine);
        }
    }

    createJellyfish() {
        // Create jellyfish body
        const bodyGeometry = new THREE.SphereGeometry(0.3, 32, 32);
        const bodyMaterial = new THREE.MeshPhongMaterial({
            color: 0x88ccff,
            transparent: true,
            opacity: 0.6,
            shininess: 100
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);

        // Create tentacles
        const tentacleGroup = new THREE.Group();
        const tentacleCount = 8;
        const segmentsPerTentacle = 5;
        const tentacleLength = 0.8;

        for (let i = 0; i < tentacleCount; i++) {
            const tentacle = new THREE.Group();
            const angle = (i / tentacleCount) * Math.PI * 2;
            
            for (let j = 0; j < segmentsPerTentacle; j++) {
                const segmentGeometry = new THREE.SphereGeometry(0.05 - (j * 0.005), 8, 8);
                const segmentMaterial = new THREE.MeshPhongMaterial({
                    color: 0x88ccff,
                    transparent: true,
                    opacity: 0.4,
                    shininess: 100
                });
                const segment = new THREE.Mesh(segmentGeometry, segmentMaterial);
                
                segment.position.y = -(j * (tentacleLength / segmentsPerTentacle));
                tentacle.add(segment);
            }
            
            tentacle.rotation.x = 0.3;
            tentacle.rotation.z = angle;
            tentacleGroup.add(tentacle);
        }

        // Create jellyfish group
        const jellyfishGroup = new THREE.Group();
        jellyfishGroup.add(body);
        jellyfishGroup.add(tentacleGroup);

        // Add animation properties
        jellyfishGroup.userData = {
            originalY: 0,
            speed: 0.5 + Math.random() * 0.5,
            phase: Math.random() * Math.PI * 2,
            tentacles: tentacleGroup,
            rotationSpeed: (Math.random() - 0.5) * 0.02
        };

        return jellyfishGroup;
    }

    addJellyfish(count) {
        for (let i = 0; i < count; i++) {
            const jellyfish = this.createJellyfish();
            
            // Position jellyfish randomly around the game board (but not too close)
            const angle = Math.random() * Math.PI * 2;
            const radius = 8 + Math.random() * 4; // Distance from center
            
            jellyfish.position.x = Math.cos(angle) * radius;
            jellyfish.position.y = Math.random() * 10 - 5;
            jellyfish.position.z = Math.sin(angle) * radius;
            
            this.jellyfish.push(jellyfish);
            this.scene.add(jellyfish);
        }
    }

    createTile(value, x, y) {
        const size = 2.4; 
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = this.getTileMaterial(value);
        const tile = new THREE.Mesh(geometry, material);
        
        // Position tile on the larger board
        tile.position.set(
            (x - 1.5) * 3,  
            1,             
            (y - 1.5) * 3   
        );
        
        tile.castShadow = true;
        tile.receiveShadow = true;
        tile.value = value;

        // Add number texture
        this.addNumberToTile(tile, value);
        
        this.boardGroup.add(tile);
        this.tiles.set(`${x},${y}`, tile);
        return tile;
    }

    addNumberToTile(tile, value) {
        // Create canvas for number texture with larger size
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.height = 512; 
        
        // Fill background color
        ctx.fillStyle = this.getTileColor(value);
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add number with larger font
        ctx.fillStyle = value <= 4 ? '#776e65' : '#f9f6f2';
        ctx.font = 'bold 240px Arial'; 
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(value.toString(), 256, 256);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        
        // Apply texture to all faces
        const materials = [];
        for (let i = 0; i < 6; i++) {
            materials.push(new THREE.MeshPhongMaterial({ 
                map: texture,
                shininess: 30
            }));
        }
        tile.material = materials;
    }

    getTileMaterial(value) {
        const colors = {
            2: 0xeee4da,
            4: 0xede0c8,
            8: 0xf2b179,
            16: 0xf59563,
            32: 0xf67c5f,
            64: 0xf65e3b,
            128: 0xedcf72,
            256: 0xedcc61,
            512: 0xedc850,
            1024: 0xedc53f,
            2048: 0xedc22e
        };

        return new THREE.MeshPhongMaterial({ 
            color: colors[value] || 0xbbada0,
            shininess: 30
        });
    }

    getTileColor(value) {
        const colors = {
            2: '#eee4da',
            4: '#ede0c8',
            8: '#f2b179',
            16: '#f59563',
            32: '#f67c5f',
            64: '#f65e3b',
            128: '#edcf72',
            256: '#edcc61',
            512: '#edc850',
            1024: '#edc53f',
            2048: '#edc22e'
        };
        return colors[value] || '#bbada0';
    }

    addInitialTiles() {
        this.addRandomTile();
        this.addRandomTile();
    }

    addRandomTile() {
        const emptyCells = [];
        for (let x = 0; x < 4; x++) {
            for (let y = 0; y < 4; y++) {
                if (this.grid[x][y] === 0) {
                    emptyCells.push({x, y});
                }
            }
        }

        if (emptyCells.length > 0) {
            const {x, y} = emptyCells[Math.floor(Math.random() * emptyCells.length)];
            const value = Math.random() < 0.9 ? 2 : 4;
            this.grid[x][y] = value;
            
            const tile = this.createTile(value, x, y);
            // Animate tile appearance
            tile.scale.set(0.1, 0.1, 0.1);
            gsap.to(tile.scale, {
                x: 1,
                y: 1,
                z: 1,
                duration: 0.2,
                ease: "back.out"
            });
        }
    }

    setupControls() {
        // Keyboard controls
        window.addEventListener('keydown', (e) => {
            if (this.isAnimating) return;
            
            switch(e.key) {
                case 'ArrowUp': this.move('up'); break;
                case 'ArrowDown': this.move('down'); break;
                case 'ArrowLeft': this.move('left'); break;
                case 'ArrowRight': this.move('right'); break;
                case 'u': case 'U': this.undo(); break;
                case 'm': case 'M': 
                    this.soundEnabled = !this.soundEnabled;
                    localStorage.setItem('soundEnabled', this.soundEnabled);
                    break;
            }
        });

        // Mouse/drag controls
        let isDragging = false;
        let startX, startY;
        const minSwipeDistance = 50; // Minimum distance for a swipe

        document.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging || this.isAnimating) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            if (distance > minSwipeDistance) {
                isDragging = false;
                
                // Determine swipe direction
                if (Math.abs(deltaX) > Math.abs(deltaY)) {
                    // Horizontal swipe
                    if (deltaX > 0) {
                        this.move('right');
                    } else {
                        this.move('left');
                    }
                } else {
                    // Vertical swipe
                    if (deltaY > 0) {
                        this.move('down');
                    } else {
                        this.move('up');
                    }
                }
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // Touch controls
        let touchStartX, touchStartY;
        document.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        });

        document.addEventListener('touchend', (e) => {
            if (this.isAnimating) return;
            
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;
            
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                if (Math.abs(deltaX) > minSwipeDistance) {
                    if (deltaX > 0) this.move('right');
                    else this.move('left');
                }
            } else {
                if (Math.abs(deltaY) > minSwipeDistance) {
                    if (deltaY > 0) this.move('down');
                    else this.move('up');
                }
            }
        });

        // Prevent default touch behavior to avoid scrolling
        document.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });
    }

    setupGameControls() {
        // New Game button
        document.getElementById('new-game').addEventListener('click', () => {
            this.resetGame();
        });

        // Reset button
        document.getElementById('reset').addEventListener('click', () => {
            this.resetGame();
        });

        // Undo button
        document.getElementById('undo').addEventListener('click', () => {
            this.undo();
        });

        // Sound toggle
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'm') {
                this.soundEnabled = !this.soundEnabled;
                localStorage.setItem('soundEnabled', this.soundEnabled);
            }
        });

        // Initialize audio context on first user interaction
        const initAudio = () => {
            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            document.removeEventListener('click', initAudio);
            document.removeEventListener('keydown', initAudio);
            document.removeEventListener('touchstart', initAudio);
        };

        document.addEventListener('click', initAudio);
        document.addEventListener('keydown', initAudio);
        document.addEventListener('touchstart', initAudio);
    }

    filterZero(row) {
        return row.filter(num => num !== 0);
    }

    slide(row) {
        // First filter out zeros
        row = this.filterZero(row);
        
        // Merge matching numbers
        for (let i = 0; i < row.length - 1; i++) {
            if (row[i] === row[i + 1]) {
                row[i] *= 2;
                row[i + 1] = 0;
                this.score += row[i];
            }
        }
        
        // Filter zeros again after merging
        row = this.filterZero(row);
        
        // Add zeros back to maintain grid size
        while (row.length < 4) {
            row.push(0);
        }
        
        return row;
    }

    move(direction) {
        if (this.isAnimating || this.gameOver) return;
        this.isAnimating = true;

        const prevGrid = this.grid.map(row => [...row]);
        let moved = false;
        let mergeOccurred = false;
        
        // Process the grid based on direction
        if (direction === 'left') {
            for (let r = 0; r < 4; r++) {
                let row = [...this.grid[r]];
                row = this.slide(row);
                if (JSON.stringify(row) !== JSON.stringify(this.grid[r])) {
                    moved = true;
                    if (row.some((value, index) => value > prevGrid[r][index])) {
                        mergeOccurred = true;
                    }
                }
                this.grid[r] = row;
            }
        } 
        else if (direction === 'right') {
            for (let r = 0; r < 4; r++) {
                let row = [...this.grid[r]];
                row.reverse();
                row = this.slide(row);
                row.reverse();
                if (JSON.stringify(row) !== JSON.stringify(this.grid[r])) {
                    moved = true;
                    if (row.some((value, index) => value > prevGrid[r][index])) {
                        mergeOccurred = true;
                    }
                }
                this.grid[r] = row;
            }
        }
        else if (direction === 'up') {
            for (let c = 0; c < 4; c++) {
                let col = [this.grid[0][c], this.grid[1][c], this.grid[2][c], this.grid[3][c]];
                col = this.slide(col);
                if (col[0] !== this.grid[0][c] || col[1] !== this.grid[1][c] || 
                    col[2] !== this.grid[2][c] || col[3] !== this.grid[3][c]) {
                    moved = true;
                    if (col.some((value, index) => value > [this.grid[0][c], this.grid[1][c], this.grid[2][c], this.grid[3][c]][index])) {
                        mergeOccurred = true;
                    }
                }
                for (let r = 0; r < 4; r++) {
                    this.grid[r][c] = col[r];
                }
            }
        }
        else if (direction === 'down') {
            for (let c = 0; c < 4; c++) {
                let col = [this.grid[0][c], this.grid[1][c], this.grid[2][c], this.grid[3][c]];
                col.reverse();
                col = this.slide(col);
                col.reverse();
                if (col[0] !== this.grid[0][c] || col[1] !== this.grid[1][c] || 
                    col[2] !== this.grid[2][c] || col[3] !== this.grid[3][c]) {
                    moved = true;
                    if (col.some((value, index) => value > [this.grid[0][c], this.grid[1][c], this.grid[2][c], this.grid[3][c]][index])) {
                        mergeOccurred = true;
                    }
                }
                for (let r = 0; r < 4; r++) {
                    this.grid[r][c] = col[r];
                }
            }
        }

        if (moved) {
            // Save state before updating visuals
            this.saveState();
            this.moveCount++;

            // Update 3D tiles
            const animations = [];
            
            // Remove old tiles
            this.tiles.forEach((tile, key) => {
                const [x, y] = key.split(',').map(Number);
                if (this.grid[x][y] !== prevGrid[x][y]) {
                    this.boardGroup.remove(tile);
                }
            });

            // Create new tile map
            const newTiles = new Map();
            
            // Create/update tiles based on new grid
            for (let x = 0; x < 4; x++) {
                for (let y = 0; y < 4; y++) {
                    if (this.grid[x][y] !== 0) {
                        if (prevGrid[x][y] === this.grid[x][y]) {
                            // Tile didn't change, keep it
                            const tile = this.tiles.get(`${x},${y}`);
                            if (tile) {
                                newTiles.set(`${x},${y}`, tile);
                            }
                        } else {
                            // Create new tile
                            const tile = this.createTile(this.grid[x][y], x, y);
                            newTiles.set(`${x},${y}`, tile);
                            
                            // Animate new tile
                            tile.scale.set(0, 0, 0);
                            gsap.to(tile.scale, {
                                x: 1,
                                y: 1,
                                z: 1,
                                duration: 0.2,
                                ease: "back.out"
                            });
                        }
                    }
                }
            }

            // Update tiles map
            this.tiles = newTiles;

            // Play appropriate sound
            if (mergeOccurred) {
                this.playSound('merge');
            } else {
                this.playSound('move');
            }

            // Add new random tile
            setTimeout(() => {
                this.addRandomTile();
                this.isAnimating = false;
            }, 200);

            // Update score and check game state
            this.updateScore();
            
            if (this.isGameOver()) {
                this.gameOver = true;
                setTimeout(() => {
                    this.playSound('gameOver');
                    document.getElementById('game-over').style.display = 'block';
                    document.getElementById('final-score').textContent = `Final Score: ${this.score}`;
                }, 500);
            }
        } else {
            this.isAnimating = false;
        }
    }

    isGameOver() {
        // Check for empty cells
        for (let x = 0; x < 4; x++) {
            for (let y = 0; y < 4; y++) {
                if (this.grid[x][y] === 0) {
                    return false;
                }
            }
        }
        
        // Check for possible merges
        for (let x = 0; x < 4; x++) {
            for (let y = 0; y < 4; y++) {
                const value = this.grid[x][y];
                
                // Check right
                if (y < 3 && this.grid[x][y + 1] === value) {
                    return false;
                }
                // Check down
                if (x < 3 && this.grid[x + 1][y] === value) {
                    return false;
                }
            }
        }
        
        return true;
    }

    resetGame() {
        // Clear the board
        this.tiles.forEach(tile => {
            this.boardGroup.remove(tile);
        });
        this.tiles.clear();

        // Reset game state
        this.grid = this.createEmptyGrid();
        this.score = 0;
        this.gameOver = false;
        this.updateScore();

        // Hide game over screen if visible
        document.getElementById('game-over').style.display = 'none';

        // Add initial tiles
        this.addInitialTiles();
    }

    updateScore() {
        document.getElementById('score').textContent = `Score: ${this.score}`;
    }

    animateJellyfish(delta) {
        const time = this.clock.getElapsedTime();
        
        this.jellyfish.forEach((jellyfish) => {
            // Pulsing animation
            const scale = 1 + Math.sin(time * jellyfish.userData.speed + jellyfish.userData.phase) * 0.1;
            jellyfish.scale.y = scale;
            
            // Tentacle movement
            jellyfish.userData.tentacles.children.forEach((tentacle, index) => {
                const tentaclePhase = time * 2 + (index / 8) * Math.PI * 2;
                tentacle.rotation.x = 0.3 + Math.sin(tentaclePhase) * 0.1;
            });
            
            // Gentle floating movement
            jellyfish.position.y += Math.sin(time + jellyfish.userData.phase) * 0.003;
            
            // Slow rotation
            jellyfish.rotation.y += jellyfish.userData.rotationSpeed;
            
            // Keep jellyfish within bounds
            if (jellyfish.position.y > 10) jellyfish.position.y = -5;
            if (jellyfish.position.y < -5) jellyfish.position.y = 10;
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Update animations
        const delta = this.clock.getDelta();
        this.animateJellyfish(delta);
        this.updateParticles(delta);

        // Subtle board rotation
        if (this.boardGroup) {
            this.boardGroup.rotation.y += 0.001;
        }

        // Update stats
        this.updateStats();

        // Render the scene
        this.renderer.render(this.scene, this.camera);
    }

    handleResize() {
        window.addEventListener('resize', () => {
            // Update camera
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            
            // Update renderer
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }
}

// Initialize the game when the window loads
window.addEventListener('load', () => {
    new Game3D();
});
