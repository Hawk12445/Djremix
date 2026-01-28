/* --- AUDIO ENGINE SETUP --- */
    let audioCtx;
    let masterGain;
    let analyser;
    let isPowered = false;

    const channels = {};

    function initAudio() {
        if(audioCtx) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();

        // Master Chain
        masterGain = audioCtx.createGain();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;

        masterGain.connect(analyser);
        analyser.connect(audioCtx.destination);
        
        masterGain.gain.value = 0.5; // Default master vol
        
        // Setup Channels
        channels[1] = new MixerChannel(1, 'mono');
        channels[2] = new MixerChannel(2, 'stereo');
        
        drawMeter();
    }

    /* --- CHANNEL CLASS --- */
    class MixerChannel {
        constructor(id, type) {
            this.id = id;
            this.type = type;
            
            // HTML5 Audio Element (Better for Play/Pause logic)
            this.audioElement = new Audio();
            this.audioElement.loop = true;
            this.audioElement.crossOrigin = "anonymous";
            
            // Create Media Element Source
            this.sourceNode = audioCtx.createMediaElementSource(this.audioElement);
            
            // Nodes
            this.gainNode = audioCtx.createGain(); // Trim/Gain
            this.levelNode = audioCtx.createGain(); // Fader
            this.panNode = audioCtx.createStereoPanner();
            
            // Internal Routing
            if (this.type === 'mono') {
                this.highEQ = audioCtx.createBiquadFilter();
                this.highEQ.type = "highshelf";
                this.highEQ.frequency.value = 12000;
                
                this.lowEQ = audioCtx.createBiquadFilter();
                this.lowEQ.type = "lowshelf";
                this.lowEQ.frequency.value = 80;

                // Chain: Source -> Gain -> High -> Low -> Pan -> Level -> Master
                this.sourceNode.connect(this.gainNode);
                this.gainNode.connect(this.highEQ);
                this.highEQ.connect(this.lowEQ);
                this.lowEQ.connect(this.panNode);
            } else {
                // Stereo Chain: Source -> Gain -> Pan(Bal) -> Level -> Master
                this.sourceNode.connect(this.gainNode);
                this.gainNode.connect(this.panNode);
            }

            this.panNode.connect(this.levelNode);
            this.levelNode.connect(masterGain);

            // Defaults (Silence until knob moved)
            this.gainNode.gain.value = 0; 
            this.levelNode.gain.value = 0;
        }

        loadFile(file) {
            const fileURL = URL.createObjectURL(file);
            this.audioElement.src = fileURL;
            const led = document.getElementById(`led${this.id}`);
            led.classList.add('led-active'); // Turn Green indicating loaded
        }

        play() {
            if(this.audioElement.src) {
                audioCtx.resume();
                this.audioElement.play();
                document.getElementById(`led${this.id}`).classList.add('led-playing');
            }
        }

        pause() {
            this.audioElement.pause();
            document.getElementById(`led${this.id}`).classList.remove('led-playing');
        }

        setParam(param, value) {
            // Value is 0 to 1 normalized
            switch(param) {
                case 'gain': 
                    // Gain Boost
                    this.gainNode.gain.value = value * 4; 
                    break;
                case 'level':
                    this.levelNode.gain.value = value * 2;
                    break;
                case 'pan':
                    this.panNode.pan.value = (value * 2) - 1;
                    break;
                case 'high':
                    this.highEQ.gain.value = (value * 40) - 20;
                    break;
                case 'low':
                    this.lowEQ.gain.value = (value * 40) - 20;
                    break;
            }
        }
    }

    /* --- UI & INTERACTION --- */
    
    // Player Controls Wrapper
    function controlPlayer(chId, action) {
        if(!isPowered) { alert("Please turn Power ON first!"); return; }
        if(!channels[chId]) return;

        if(action === 'play') channels[chId].play();
        if(action === 'pause') channels[chId].pause();
    }

    // Power
    const powerBtn = document.getElementById('powerBtn');
    powerBtn.addEventListener('click', () => {
        if(!isPowered) {
            initAudio();
            audioCtx.resume();
            isPowered = true;
            powerBtn.textContent = "POWER ON";
            powerBtn.classList.add('power-on');
        } else {
            audioCtx.suspend();
            isPowered = false;
            powerBtn.textContent = "POWER OFF";
            powerBtn.classList.remove('power-on');
            
            // Stop visuals
            document.querySelectorAll('.status-led').forEach(l => {
                l.classList.remove('led-active', 'led-playing');
            });
        }
    });

    // File Inputs
    ['file1', 'file2'].forEach((id, index) => {
        document.getElementById(id).addEventListener('change', function(e) {
            if(!isPowered) { 
                alert("Please turn Power ON first to initialize the mixer!"); 
                this.value = ''; // Reset input
                return; 
            }
            const file = e.target.files[0];
            if (file) {
                channels[index + 1].loadFile(file);
            }
        });
    });

    // Knob Physics
    const knobs = document.querySelectorAll('.knob');
    knobs.forEach(knob => {
        let startY = 0;
        let currentDeg = -135; 
        
        const styleRot = knob.style.transform.match(/-?\d+/);
        if(styleRot) currentDeg = parseInt(styleRot[0]);

        const handleStart = (y) => {
            startY = y;
            document.body.style.userSelect = 'none';
        };

        const handleMove = (y) => {
            const delta = startY - y;
            currentDeg += delta * 2;
            
            if (currentDeg < -135) currentDeg = -135;
            if (currentDeg > 135) currentDeg = 135;

            knob.style.transform = `rotate(${currentDeg}deg)`;
            
            const normalized = (currentDeg + 135) / 270;
            updateAudioParam(knob, normalized);
            
            startY = y;
        };

        knob.addEventListener('mousedown', (e) => {
            handleStart(e.clientY);
            const onMouseMove = (ev) => handleMove(ev.clientY);
            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                document.body.style.userSelect = 'auto';
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        knob.addEventListener('touchstart', (e) => {
            handleStart(e.touches[0].clientY);
            const onTouchMove = (ev) => {
                ev.preventDefault();
                handleMove(ev.touches[0].clientY);
            };
            const onTouchEnd = () => {
                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('touchend', onTouchEnd);
            };
            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onTouchEnd);
        });
    });

    function updateAudioParam(knobElement, value) {
        if(!isPowered || !audioCtx) return;
        
        const type = knobElement.dataset.control;
        const chId = knobElement.dataset.channel;

        if (chId === 'master') {
            if(type === 'main') masterGain.gain.value = value * 2;
        } else {
            channels[chId].setParam(type, value);
        }
    }

    // Visualizer Loop
    function drawMeter() {
        const canvas = document.getElementById('vuMeter');
        const ctx = canvas.getContext('2d');
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        function render() {
            requestAnimationFrame(render);
            if(!isPowered) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                return;
            }

            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for(let i = 0; i < bufferLength; i++) sum += dataArray[i];
            let average = sum / bufferLength;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const bars = 6;
            const height = canvas.height / bars;
            const level = (average / 80) * bars; // Sensitivity adjustment

            for(let i = 0; i < bars; i++) {
                ctx.beginPath();
                // LED Backgrounds
                if (i < 1) ctx.fillStyle = '#400';
                else if (i < 2) ctx.fillStyle = '#440';
                else ctx.fillStyle = '#030';

                // Lit LEDs
                if ((bars - 1 - i) < level) {
                    if (i < 1) ctx.fillStyle = '#f00'; // CLIP
                    else if (i < 2) ctx.fillStyle = '#ff0'; 
                    else ctx.fillStyle = '#0f0';
                }

                ctx.arc(canvas.width / 2, (i * height) + 10, 5, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
        render();
          }
