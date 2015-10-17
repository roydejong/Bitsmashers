var Fighters = {
    TheDoctor: 'thedoctor'
};

var FighterEntity = Entity.extend({
    isPlayer: true,
    isFighter: true,

    fighterType: null,

    xMargin: 0,
    yMargin: 0,

    playerNumber: 0,

    isAttacking: false,

    dead: false,

    init: function () {
        this._super();

        this.posX = 170;
        this.posY = 100;

        this.xMargin = 0;
        this.yMargin = 0;

        this.playerNumber = 0;
        this.isAttacking = false;

        this.dead = false;
    },

    getName: function () {
        return 'Player ' + this.player.number;
    },

    configureRenderer: function () {
        this.renderer = new FighterRenderer(this);
    },

    projectRect: function (x, y) {
        var r = this._super(x, y);

        r.top += this.yMargin;
        r.height -= this.yMargin;

        r.left += this.xMargin;
        r.width -= this.xMargin * 2;

        r.right = r.left + r.width;
        r.bottom = r.top + r.height;
        return r;
    },

    isLocalPlayer: function () {
        return (Game.stage.player === this);
    },

    prepareSyncMessage: function () {
        return {
            op: Opcode.PLAYER_UPDATE,
            p: this.playerNumber,
            x: this.posX,
            y: this.posY,
            vX: this.velocityX,
            vY: this.velocityY,
            a: this.isAttacking,
            aW: this.attackingWith != null ? this.attackingWith.id : null
        };
    },

    applySyncMessage: function (data) {
        this.posX = data.x;
        this.posY = data.y;
        this.velocityX = data.vX;
        this.velocityY = data.vY;
        this.isAttacking = data.a;

        if (data.aW != null) {
            if (this.attackingWith == null || this.attackingWith.id != data.aW) {
                this.attackingWith = Game.stage.getEntityById(data.aW);
            }
        } else {
            this.attackingWith = null;
        }
    },

    pickUp: function (entity) {
        this.isAttacking = true;
        this.attackingWith = entity;

        // Check if any other entities were trying to attack (steal)
        for (var i = 0; i < Game.stage.entities.length; i++) {
            var e = Game.stage.entities[i];

            if (e != this && e.isAttacking && e.attackingWith == this.attackingWith) {
                e.isAttacking = false;
                e.attackingWith = null;
                Log.writeMessage('Player ' + this.playerNumber + ' blocked Player ' + e.playerNumber + '!');
                e.forceDisableAttack = true;
                break;
            }
        }
    },

    update: function () {
        if (this.dead) {
            return;
        }

        if (this.forceDisableAttack) {
            this.isAttacking = false;
            this.attackingWith = null;
            this.forceDisableAttack = false;
        }

        this._super();

        if (this.isAttacking && this.attackingWith != null) {
            this.attackingWith.posX = this.posX;
            this.attackingWith.posY = this.rect().top - this.attackingWith.height;

            this.attackingWith.causesCollision = true;
            this.attackingWith.causesTouchDamage = false;
            this.attackingWith.receivesCollision = false;
            this.attackingWith.affectedByGravity = false;
        }

        // Smash blocks when jumping up if velocity is high enough
        if (this.velocityY < -7.5) {
            var projectedPos = this.projectRect(this.posX + this.velocityX, this.posY + (this.velocityY * 2));
            var projectedIntersects = this.map.checkCollisions(this, projectedPos);

            if (projectedIntersects.length > 0) {
                var block = projectedIntersects[0];

                if (block.isBlock && block != this.attackingWith) {
                    block.smash();
                    this.velocityY = 0;
                }
            }
        }

        if (Net.isHost && this.shouldDie()) {
            this.die();
        }
    },

    doThrow: function (viaSync) {
        if (this.attackingWith == null) {
            return;
        }

        this.attackingWith.isProjectile = true;
        this.attackingWith.thrownBy = this;
        this.attackingWith.causesCollision = false;
        this.attackingWith.receivesCollision = false;
        this.attackingWith.affectedByGravity = true;
        this.attackingWith.velocityX = this.direction == Direction.LEFT ? -32 : 32;
        this.attackingWith.velocityY += 5;

        this.attackingWith = null;
        this.isAttacking = false;

        this.landed = true;
        this.jumped = false;

        if (!viaSync) {
            var netPayload = {
                op: Opcode.THROW,
                p: this.playerNumber
            };

            if (Net.isHost) {
                Net.broadcastMessage(netPayload);
            } else {
                Net.getConnection().sendMessage(netPayload);
            }
        }
    },

    pain: function (source, throwbackPower) {
        AudioOut.playSfx('pain.wav', 0.5);

        if (this.isLocalPlayer()) {
            Camera.rumble(10, 2);
        } else {
            Camera.rumble(10, 1);
        }

        Particles.emit({
            x: this.posX + (this.width / 2),
            y: this.posY + (this.height / 2),
            color: '#ff0000',
            min: 25,
            max: 50
        });

        if (throwbackPower != 0) {
            // Apply throwback
            if (source.velocityX < 0) {
                // Coming in from the right
                throwbackPower = -throwbackPower;
            }

            this.velocityX += throwbackPower;

            // Turn ourselves into a projectile
            this.affectedByGravity = true;
            this.causesCollision = false;
            this.receivesCollision = false;
            this.isProjectile = true;
            this.thrownBy = source;
        }

        this.damageFlash = 4;
    },

    shouldDie: function () {
        return this.posY >= Game.stage.height;
    },

    die: function (viaSync) {
        if (this.dead) {
            return;
        }

        this.dead = true;
        AudioOut.playSfx('death.wav');

        this.causesCollision = false;
        this.receivesCollision = false;

        var killer = null;

        if (this.isProjectile && this.thrownBy != null) {
            killer = this.thrownBy;

            while (killer.thrownBy != null) {
                // Find the instigator of this throwing chain!
                killer = killer.thrownBy;
            }
        }

        if (!viaSync) {
            if (Net.isHost || this.isLocalPlayer()) {
                var payload = {
                    op: Opcode.DEATH,
                    playerNumber: this.playerNumber,
                    b: Net.isHost
                };

                Net.broadcastMessage(payload);
            }
        }

        if (killer == null) {
            Log.writeMessage('Player ' + this.playerNumber + ' committed suicide');
        } else {
            Log.writeMessage('Player ' + this.playerNumber + ' was killed by ' + killer.getName());
        }

        if (this.isLocalPlayer()) {
            Camera.centerToMap();

            if (this.map.unlocked) {
                $('#uded').show();
            }
        }

        if (this.attackingWith != null) {
            this.map.remove(this.attackingWith);

            this.isAttacking = false;
            this.attackingWith = null;
        }

        this.map.remove(this);

        Scoreboard.registerDeath(this);

        if (killer != null && killer.isPlayer) {
            Scoreboard.registerKill(killer);
        }
    }
});