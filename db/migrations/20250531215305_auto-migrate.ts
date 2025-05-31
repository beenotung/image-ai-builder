import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('label'))) {
    await knex.schema.createTable('label', table => {
      table.increments('id')
      table.text('title').notNullable()
      table.integer('dependency_id').unsigned().nullable().references('label.id')
      table.timestamps(false, true)
    })
  }
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('label')
}
