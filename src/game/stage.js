var Stage = Class.extend({
    id: null,
    entities: [],
    toRemove: [],
    isStage: true,

    init: function () {
        this.clear();
    },

    clear: function () {
        this.entities = [];
        this.toRemove = [];
    },

    add: function (entity) {
        entity.map = this;
        this.entities.push(entity);
    },

    remove: function (entity) {
        if (this.toRemove.indexOf(entity) === -1) {
            this.toRemove.push(entity);
            return true;
        }

        return false;
    },

    draw: function (ctx) {
        // Draw all non-player entities on the map
        {
            for (var i = 0; i < this.entities.length; i++) {
                var entity = this.entities[i];

                if (entity.isPlayer) {
                    continue;
                }

                entity.draw(ctx);
            }
        }

        // Draw all players. We draw them last so they are on top.
        {
            for (var j = 0; j < this.entities.length; j++) {
                var entity = this.entities[j];

                if (entity.isPlayer) {
                    continue;
                }

                entity.draw(ctx);
            }
        }
    },

    update: function () {
        // Process all pending entity removals
        {
            for (var i = 0; i < this.toRemove.length; i++) {
                var removeEntity = this.toRemove[i];
                var entityIdx = this.entities.indexOf(removeEntity);

                if (entityIdx === -1) {
                    continue;
                }

                this.entities.splice(entityIdx, 1);
            }

            this.toRemove = [];
        }

        // Process all entities on the map
        {
            for (var j = 0; j < this.entities.length; j++) {
                var entity = this.entities[j];
                entity.update();
            }
        }
    }
});