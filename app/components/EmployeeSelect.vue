<script setup lang="ts">
import { errorMessage, type Employee } from '~/utils/leave-api'
import { searchEmployees, toEmployeeOptions } from '~/utils/employees'

/** 乗務員の選択 (社員C か氏名で検索)。一覧は自分で取る。 */
const model = defineModel<string>({ required: true })

const api = useLeaveApi()
const employees = ref<Employee[]>([])
const searchTerm = ref('')
const error = ref('')

const items = computed(() => toEmployeeOptions(searchEmployees(employees.value, searchTerm.value)))

onMounted(async () => {
  try {
    employees.value = await api.listEmployees()
  }
  catch (e) {
    error.value = errorMessage(e)
  }
})
</script>

<template>
  <div>
    <USelectMenu
      v-model="model"
      v-model:search-term="searchTerm"
      :items="items"
      value-key="value"
      label-key="label"
      ignore-filter
      placeholder="社員C か氏名で検索"
      class="w-full"
    />
    <p v-if="error" class="mt-1 text-sm text-(--ui-error)">{{ error }}</p>
  </div>
</template>
