<template>
    <div class="container-control">
        <span v-if="storage.state" class="tag active">Conected</span>
        <span v-else class="tag">Disconnected</span>
        <div class="control">
            <button @click="enableproxy" class="btn-control row items-center justify-center" :class="{'active' : storage.state}">
                <span>⏻</span>
            </button>
        </div>
    </div>
</template>

<script>
import useStore from '../stores/useStore';
import { enableBadge, disableBadge } from '../utils/badge';
import { disableProxy, enableProxy } from '../utils/proxy';
export default {
    data() {
        return {
            storage: useStore(),
        }
    },
    
    methods: {
        async enableproxy() {
            if(!this.storage.state) {
                const result = enableProxy();
                if(result) {
                    await this.storage.changeState();
                    enableBadge();
                }
            } else {
                const result = await disableProxy();
                if(result)  {
                    this.storage.changeState();
                    disableBadge();
                }
            }
        },
    }
}
</script>

<style scoped>
.container-control {
    position: absolute;
    bottom: -60px;
    left: 0;
    right: 0;
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.control {
    width: 140px;
    height: 140px;
    border-radius: 50%;
    background-color: #F1F5F9;
    padding: 1rem;
}

.btn-control {
    width: 100%;
    height: 100%;
    background-color: #E67B7B;
    border-radius: 50%;
    border: none;
    box-shadow: rgba(0, 0, 0, 0.35) 0px -50px 36px -28px inset;
    color: white;
    font-size: 2rem;
    cursor: pointer;
}

.control>span {
    line-height: 2rem;
}

.tag {
    position: absolute;
    width: 50%;
    background-color: #FFE6E6;
    color: #E67B7B;
    border: 1px solid #E67B7B;
    top: -25px;
    border-radius: 1rem;
    padding: .3rem 1rem;
    font-size: .8rem;
    display: flex;
    justify-content: center;
    align-items: center;
}

.active {
    background-color: #4AC176;
}

.tag.active {
    color: #4AC176;
    border-color: #4AC176;
    background-color: #CBFFDE;
}
</style>