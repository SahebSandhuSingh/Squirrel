export const up = async (pgm) => {
  pgm.createTable('idempotency_keys', {
    key: { type: 'text', notNull: true },
    run_id: {
      type: 'uuid',
      notNull: true,
      references: '"runs"',
      onDelete: 'CASCADE'
    },
    response: { type: 'jsonb', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // Adding the composite primary key
  pgm.addConstraint('idempotency_keys', 'idempotency_keys_pkey', {
    primaryKey: ['run_id', 'key']
  });
};

export const down = async (pgm) => {
  pgm.dropTable('idempotency_keys');
};
